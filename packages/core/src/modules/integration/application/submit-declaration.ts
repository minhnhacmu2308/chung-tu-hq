// Ký số & khai tạm lần đầu (ADR 0005 outbox): guard → outbox IDA/EDA (idempotency_key) → declaration SUBMITTED → dossier SUBMITTED → job customs-send.
// Chỉ gửi khai tạm; khai chính thức (IDC/EDC) và các nghiệp vụ sau do người khai bấm (performOperation).
import { declarationRequiredGaps, requiredGapsText, sameRateWeek, vnDateOf, weekStart } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { buildFptRequest } from "../domain/declaration-to-fpt.js";
import { stageOf } from "../domain/state-machine.js";
import type { CustomsDeps, OutboxRow, ResultRow } from "./customs-ports.js";
import { performOperation } from "./perform-operation.js";

export const outboxKey = (dossierId: string, op: string, version: number, retry = 0) => `${dossierId}:${op}:v${version}${retry ? `:retry${retry}` : ""}`;

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

export async function submitDeclaration(deps: CustomsDeps, ctx: Ctx, dossierId: string, certificateId: string): Promise<Result<{ outboxId: string }>> {
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
  // Dữ liệu có thể đổi sau khi duyệt: kiểm lại ô bắt buộc trước khi tạo thông điệp (cùng quy tắc nút Ký số ở giao diện).
  const items = [...snap.payload.items].sort((a, b) => a.lineNo - b.lineNo);
  const gaps = declarationRequiredGaps(snap.payload.kind, Object.entries(snap.payload.fields).map(([code, f]) => ({ code, value: f.value })), items);
  if (gaps.length) return err(reasonError("VALIDATION", "REQUIRED_FIELDS_MISSING_SUBMIT", { n: gaps.length, fields: requiredGapsText(gaps, items.map((i) => i.lineNo)) }, { requiredGaps: gaps }));
  if (!certificateId || !(await deps.certificates.exists(ctx.orgId, certificateId))) return err(reasonError("NO_CERT", "CERTIFICATE_REQUIRED"));

  const op = snap.payload.kind === "IDA" ? "IDA" : "EDA";
  // Đã có số tờ khai (gọi về sửa rồi duyệt lại) → khai tạm lại theo luồng, không tạo kết quả truyền mới.
  const existingResult = await deps.uow.asOrg(ctx, (r) => r.results.get(ctx.orgId, dossierId));
  if (existingResult && stageOf(existingResult) !== "NOT_SENT") {
    const sent = await performOperation(deps, ctx, dossierId, op);
    return sent.ok ? ok({ outboxId: "" }) : sent;
  }
  const built = buildFptRequest(snap.payload);
  if (built.blockers.length) return err(reasonError("BLOCKER_FAILED", "DECLARATION_NOT_TRANSMITTABLE", { blockers: built.blockers.join("; ") }));
  // Sai đặc tả FPT (thiếu ô Required, sai kiểu/độ dài) → Hải quan/FPT từ chối: chặn trước khi đánh dấu đã khai thay vì để cổng gửi báo lỗi sau.
  if (built.issues.length) return err(reasonError("VALIDATION", "DECLARATION_SPEC_INVALID", { issues: built.issues.join("; ") }, { issues: built.issues }));
  const now = deps.clock.now();
  const key = outboxKey(dossierId, op, snap.version);
  const created = await deps.uow.asOrg(ctx, async (r) => {
    const existing = await r.outbox.findByKey(ctx.orgId, key);
    if (existing) {
      // Lần trước crash sau khi tạo outbox mà chưa đẩy job → đẩy lại (jobId trùng là idempotent), vẫn báo đã truyền.
      if (existing.status === "PENDING" && existing.attempts === 0) await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: existing.id }, { jobId: `customs-send:${existing.id}` });
      return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã được truyền – không gửi trùng"));
    }
    const row: OutboxRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: 1, declarationId: snap.declarationId, operation: op, idempotencyKey: key, payload: { request: built.request, warnings: built.warnings, issues: built.issues, certificateId }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now };
    try {
      await r.outbox.insert(row);
    } catch (e) {
      // Hai request song song: insert thứ hai vi phạm unique → coi như đã truyền.
      if (/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã được truyền – không gửi trùng"));
      throw e;
    }
    const result: ResultRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: 1, externalId: null, declarationNo: null, channel: null, channelNote: null, clearanceStatus: "WAITING", customsTaxVnd: snap.estimatedTaxVnd, state: "APPROVED", pollCount: 0, raw: { stage: "NOT_SENT", certificateId }, updatedAt: now };
    await r.results.upsert(result);
    return ok(row);
  });
  if (!created.ok) return created;
  await deps.declarations.markSubmitted(ctx, dossierId);
  await deps.dossiers.update(ctx.orgId, dossierId, { status: "SUBMITTED", step: "submit" });
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: created.value.id }, { jobId: `customs-send:${created.value.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok({ outboxId: created.value.id });
}
