// Ký số & khai tạm lần đầu (ADR 0005 outbox): guard từng tờ khai nhánh → kết quả NOT_SENT mọi nhánh + outbox IDA/EDA nhánh 1 (idempotency_key)
// → declaration SUBMITTED → dossier SUBMITTED → job customs-send. Nhánh 2..N do worker khai tạm nối tiếp (enqueueBranchPreDeclare, spec §6.2).
// Chỉ gửi khai tạm; khai chính thức (IDC/EDC) và các nghiệp vụ sau do người khai bấm (performOperation).
import { branchCount, sameRateWeek, vnDateOf, weekStart } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { buildFptRequest } from "../domain/declaration-to-fpt.js";
import { sheetSnapshot } from "../domain/branches.js";
import { stageOf } from "../domain/state-machine.js";
import { buildSheet, CHECK_ONLY_FIRST_NO, contentKey, contentOpFor, gapsError, outboxKey, pinOf, pinOfOutbox, sheetCountError, sheetOf } from "./branch-send.js";
import type { CustomsDeps, OutboxRow, ResultRow } from "./customs-ports.js";
import { auditHysWaiver, hysGuard, recordHysWaiver } from "./hys-guard.js";
import { performOperation } from "./perform-operation.js";
import { resultsSentError } from "./sent-sheets.js";

export { contentKey, contentOpFor, enqueueBranchPreDeclare, outboxKey, outboxVersion, pinOf, stalePinReason, type PreDeclareMode } from "./branch-send.js";

/**
 * Lần truyền trước crash sau khi đã ghi outbox/đánh dấu SUBMITTED nhưng chưa kịp đẩy job (ghi DB và đẩy job không cùng transaction):
 * dòng outbox còn PENDING với attempts = 0 → đẩy lại job (jobId trùng là idempotent) để tờ khai không kẹt "đã truyền" mà không bao giờ gửi.
 */
async function reenqueueStuckOutbox(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<void> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.outbox.listForDossier(ctx.orgId, dossierId));
  for (const row of rows.filter((o) => o.status === "PENDING" && o.attempts === 0)) {
    await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: row.id }, { jobId: `customs-send:${row.id}` });
  }
}

export async function submitDeclaration(deps: CustomsDeps, ctx: Ctx, dossierId: string, certificateId: string, opts?: { hysWaived?: boolean }): Promise<Result<{ outboxId: string }>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (dossier.status === "CANCELLED") return err(reasonError("INVALID_STATE", "DOSSIER_CANCELLED"));
  if (dossier.status === "SUBMITTED" || dossier.status === "CLEARED") {
    await reenqueueStuckOutbox(deps, ctx, dossierId);
    return err(reasonError("ALREADY_SUBMITTED", "DOSSIER_ALREADY_SUBMITTED"));
  }
  if (dossier.status !== "APPROVED") return err(reasonError("NOT_APPROVED", "DOSSIER_NOT_APPROVED"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  if (snap.status === "SUBMITTED") {
    await reenqueueStuckOutbox(deps, ctx, dossierId);
    return err(reasonError("ALREADY_SUBMITTED", "DECLARATION_ALREADY_SUBMITTED"));
  }
  if (snap.status !== "APPROVED") return err(reasonError("NOT_APPROVED", "DECLARATION_NOT_APPROVED"));
  if (snap.unconfirmedHs > 0) return err(reasonError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: snap.unconfirmedHs }));
  // Tỷ giá tính thuế áp theo tuần đăng ký tờ khai (thứ Hai → Chủ nhật, giờ VN): dựng tuần trước mà truyền tuần này → sai thuế.
  if (!sameRateWeek(snap.exchangeRateDate, vnDateOf(deps.clock.now())))
    return err(reasonError("RATE_WEEK_CHANGED", "RATE_WEEK_CHANGED_REOPEN", { week: weekStart(snap.exchangeRateDate) }));
  const blockers = await deps.validation.blockerFails(ctx.orgId, dossierId);
  if (blockers > 0) return err(reasonError("BLOCKER_FAILED", "BLOCKER_RULES_FAILED", { n: blockers }));
  const of = branchCount(snap.payload.items.length);
  // Đã có tờ được cấp số mà số tờ nay khác số tờ đã khai → không gửi tờ nào (cùng điều kiện luật R-BRANCH-COUNT-LOCKED, kiểm ở mã nguồn).
  const count = sheetCountError(await deps.uow.asOrg(ctx, (r) => r.results.listForDossier(ctx.orgId, dossierId)), of);
  if (count) return err(count);
  // Guard trên TỪNG tờ trước khi gửi bất kỳ tờ nào (spec §6.1). Tờ 2..N kiểm với số tờ 1 giả (chưa có) – chỉ để kiểm, không gửi.
  const sheets = Array.from({ length: of }, (_, i) => sheetOf(snap.payload, i + 1, i === 0 ? null : CHECK_ONLY_FIRST_NO));
  // Dữ liệu có thể đổi sau khi duyệt: kiểm lại ô bắt buộc trước khi tạo thông điệp.
  for (const s of sheets) {
    const gaps = gapsError(s);
    if (gaps) return err(gaps);
  }
  if (!certificateId || !(await deps.certificates.exists(ctx.orgId, certificateId))) return err(reasonError("NO_CERT", "CERTIFICATE_REQUIRED"));

  const op = snap.payload.kind === "IDA" ? "IDA" : "EDA";
  // Đã có số tờ khai (gọi về sửa rồi duyệt lại) → khai tạm lại theo luồng, không tạo kết quả truyền mới.
  const existingResult = await deps.uow.asOrg(ctx, (r) => r.results.get(ctx.orgId, dossierId));
  if (existingResult && stageOf(existingResult) !== "NOT_SENT") {
    // Lô nhiều tờ (spec §6.4): gửi nội dung tờ đầu tiên cần gửi theo giai đoạn của tờ (IDA01 / IDA sau gọi về / IDA lần đầu); worker nối tiếp các tờ sau.
    if (of > 1) {
      const all = await deps.uow.asOrg(ctx, (r) => r.results.listForDossier(ctx.orgId, dossierId));
      // Gọi về một phần được (thay R3); tờ chưa gọi về phải giữ đúng nội dung Hải quan đang có (spec §2.5) – lệch → chặn, gọi về các tờ đó hoặc hoàn tác.
      const changed = resultsSentError(snap.payload, all);
      if (changed) return err(changed);
      const target = all.filter((r) => r.branch <= of).map((r) => ({ branch: r.branch, op: contentOpFor(stageOf(r), snap.payload.kind) })).find((t) => t.op);
      if (target?.op) {
        const sent = await performOperation(deps, ctx, dossierId, target.op, target.branch, opts);
        return sent.ok ? ok({ outboxId: "" }) : sent;
      }
    }
    const sent = await performOperation(deps, ctx, dossierId, op, 1, opts);
    return sent.ok ? ok({ outboxId: "" }) : sent;
  }
  // Nhắc khai HYS trước IDA/EDA: sau mọi guard khác, trước khi tạo outbox (lần gửi lại qua performOperation tự guard).
  const hys = await hysGuard(deps, ctx, dossierId, snap, opts?.hysWaived === true);
  if (!hys.ok) return hys;
  const builds = sheets.map(buildSheet);
  const failed = builds.find((b) => !b.ok);
  if (failed && !failed.ok) return failed;
  const built = (builds[0] as { ok: true; value: ReturnType<typeof buildFptRequest> }).value;
  const now = deps.clock.now();
  // Lô nhiều tờ: ghim lần duyệt; tờ 1 bị từ chối trước khi có số → mở lại, duyệt lại (cùng phiên bản) → khóa mới `:n<k>` thay vì trùng khóa lần trước.
  const pin = pinOf(snap);
  const prior = of > 1 ? (await deps.uow.asOrg(ctx, (r) => r.outbox.listForDossier(ctx.orgId, dossierId))).filter((o) => o.branch === 1 && o.operation === op) : [];
  const key = of > 1 ? contentKey(dossierId, op, snap.version, prior.length + 1) : outboxKey(dossierId, op, snap.version);
  const created = await deps.uow.asOrg(ctx, async (r) => {
    const existing = (await r.outbox.findByKey(ctx.orgId, key)) ?? prior.find((o) => o.status === "PENDING" || pinOfOutbox(o) === pin);
    if (existing) {
      // Lần trước crash sau khi tạo outbox mà chưa đẩy job → đẩy lại (jobId trùng là idempotent), vẫn báo đã truyền.
      if (existing.status === "PENDING" && existing.attempts === 0) await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: existing.id }, { jobId: `customs-send:${existing.id}` });
      return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã được truyền – không gửi trùng"));
    }
    const row: OutboxRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: 1, declarationId: snap.declarationId, operation: op, idempotencyKey: key, payload: { request: built.request, warnings: built.warnings, issues: built.issues, certificateId, ...(of > 1 ? { pin, sent: sheetSnapshot(snap.payload, 1) } : {}) }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now };
    try {
      await r.outbox.insert(row);
    } catch (e) {
      // Hai request song song: insert thứ hai vi phạm unique → coi như đã truyền.
      if (/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã được truyền – không gửi trùng"));
      throw e;
    }
    if (hys.value) await recordHysWaiver(deps, r, ctx, dossierId, hys.value);
    // Mọi nhánh có kết quả NOT_SENT ngay (cùng transaction với outbox nhánh 1); thuế dự tính: lô một tờ – cả lô, nhiều tờ – của từng tờ.
    for (const s of sheets) {
      const result: ResultRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: s.no, externalId: null, declarationNo: null, channel: null, channelNote: null, clearanceStatus: "WAITING", customsTaxVnd: of === 1 ? snap.estimatedTaxVnd : snap.branchTaxVnd?.[s.no - 1] ?? null, state: "APPROVED", pollCount: 0, raw: { stage: "NOT_SENT", certificateId }, updatedAt: now };
      await r.results.upsert(result);
    }
    // Số tờ giảm giữa hai lần truyền (vd bị từ chối trước khi có số, sửa 120 → 90 dòng): bỏ kết quả nhánh thừa chưa từng khai.
    await r.results.deleteUnsentAbove(ctx.orgId, dossierId, of);
    return ok(row);
  });
  if (!created.ok) return created;
  if (hys.value) await auditHysWaiver(deps, ctx, dossierId, hys.value);
  await deps.declarations.markSubmitted(ctx, dossierId);
  await deps.dossiers.update(ctx.orgId, dossierId, { status: "SUBMITTED", step: "submit" });
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: created.value.id }, { jobId: `customs-send:${created.value.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok({ outboxId: created.value.id });
}
