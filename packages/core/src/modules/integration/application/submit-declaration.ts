// Ký số & khai tạm lần đầu (ADR 0005 outbox): guard từng tờ khai nhánh → kết quả NOT_SENT mọi nhánh + outbox IDA/EDA nhánh 1 (idempotency_key)
// → declaration SUBMITTED → dossier SUBMITTED → job customs-send. Nhánh 2..N do worker khai tạm nối tiếp (enqueueBranchPreDeclare, spec §6.2).
// Chỉ gửi khai tạm; khai chính thức (IDC/EDC) và các nghiệp vụ sau do người khai bấm (performOperation).
import { branchCount, declarationRequiredGaps, requiredGapsText, sameRateWeek, vnDateOf, weekStart } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError, type DomainError } from "../../../shared/errors.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { branchPayload } from "../domain/branches.js";
import { buildFptRequest, type DeclarationPayload } from "../domain/declaration-to-fpt.js";
import { stageOf } from "../domain/state-machine.js";
import type { CustomsDeps, OutboxRow, ResultRow } from "./customs-ports.js";
import { performOperation } from "./perform-operation.js";

/** Khóa idempotency outbox. Nhánh 1 giữ đúng dạng cũ (dữ liệu đang chạy không bị gửi trùng); nhánh ≥ 2 thêm `:b<no>`. */
export const outboxKey = (dossierId: string, op: string, version: number, retry = 0, branch = 1) => `${dossierId}:${op}:v${version}${retry ? `:retry${retry}` : ""}${branch > 1 ? `:b${branch}` : ""}`;

/** Phiên bản tờ khai trong khóa outbox (`:v<n>`); khóa theo số lần gửi (`:n<k>`) không có → null. */
export const outboxVersion = (key: string): number | null => {
  const m = /:v(\d+)(?::|$)/.exec(key);
  return m ? Number(m[1]) : null;
};

/**
 * Ai xếp khai tạm nhánh: worker nối tiếp – tờ khai phải còn SUBMITTED đúng phiên bản đã truyền ở các tờ trước (không trộn nội dung hai phiên bản);
 * người dùng (gửi lại sau mở lại, duyệt lại) – tờ khai APPROVED.
 */
export type PreDeclareMode = { by: "chain"; version: number } | { by: "user" };

/** Số tờ khai giả CHỈ để kiểm tờ 2..N lúc truyền lần đầu (số tờ 1 chưa có) – thông điệp dựng với số này bị bỏ, không bao giờ gửi. */
const CHECK_ONLY_FIRST_NO = "000000000000";

type Sheet = { no: number; of: number; payload: DeclarationPayload; /** Vị trí dòng đầu của tờ trong dòng hàng cả lô (đã sắp theo lineNo). */ offset: number; blockers: string[] };
const sheetOf = (p: DeclarationPayload, no: number, firstNo: string | null): Sheet => {
  const b = branchPayload(p, no, firstNo);
  return { no, of: b.range.of, payload: b.payload, offset: b.range.index[0], blockers: b.blockers };
};
/** Lô nhiều tờ: thông báo lỗi nêu số tờ; lô một tờ giữ nguyên câu cũ. */
const tag = (s: Sheet, text: string) => (s.of > 1 ? `Tờ ${s.no}/${s.of}: ${text}` : text);
const sheetParam = (s: Sheet) => (s.of > 1 ? { sheet: `${s.no}/${s.of}` } : {});

/** Ô bắt buộc trống trên dòng hàng của tờ (cùng quy tắc nút Ký số ở giao diện). Chỉ số dòng trong chi tiết theo cả lô. */
function gapsError(s: Sheet): DomainError | null {
  const items = [...s.payload.items].sort((a, b) => a.lineNo - b.lineNo);
  const gaps = declarationRequiredGaps(s.payload.kind, Object.entries(s.payload.fields).map(([code, f]) => ({ code, value: f.value })), items);
  if (!gaps.length) return null;
  const requiredGaps = gaps.map((g) => (g.line === undefined ? g : { ...g, line: g.line + s.offset }));
  return reasonError("VALIDATION", "REQUIRED_FIELDS_MISSING_SUBMIT", { n: gaps.length, fields: tag(s, requiredGapsText(gaps, items.map((i) => i.lineNo))), ...sheetParam(s) }, { requiredGaps });
}

/** Dựng thông điệp FPT của tờ; blocker (kể cả của tách tờ) hoặc sai đặc tả FPT → lỗi nêu số tờ. */
function buildSheet(s: Sheet): Result<ReturnType<typeof buildFptRequest>> {
  const built = buildFptRequest(s.payload);
  const blockers = [...s.blockers, ...built.blockers];
  if (blockers.length) return err(reasonError("BLOCKER_FAILED", "DECLARATION_NOT_TRANSMITTABLE", { blockers: tag(s, blockers.join("; ")), ...sheetParam(s) }));
  // Sai đặc tả FPT (thiếu ô Required, sai kiểu/độ dài) → Hải quan/FPT từ chối: chặn trước khi đánh dấu đã khai thay vì để cổng gửi báo lỗi sau.
  if (built.issues.length) return err(reasonError("VALIDATION", "DECLARATION_SPEC_INVALID", { issues: tag(s, built.issues.join("; ")), ...sheetParam(s) }, { issues: built.issues }));
  return ok(built);
}

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
  // Guard trên TỪNG tờ trước khi gửi bất kỳ tờ nào (spec §6.1). Tờ 2..N kiểm với số tờ 1 giả (chưa có) – chỉ để kiểm, không gửi.
  const of = branchCount(snap.payload.items.length);
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
    const sent = await performOperation(deps, ctx, dossierId, op);
    return sent.ok ? ok({ outboxId: "" }) : sent;
  }
  const builds = sheets.map(buildSheet);
  const failed = builds.find((b) => !b.ok);
  if (failed && !failed.ok) return failed;
  const built = (builds[0] as { ok: true; value: ReturnType<typeof buildFptRequest> }).value;
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
    // Mọi nhánh có kết quả NOT_SENT ngay (cùng transaction với outbox nhánh 1); thuế dự tính cả lô chỉ gắn khi lô một tờ.
    for (const s of sheets) {
      const result: ResultRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch: s.no, externalId: null, declarationNo: null, channel: null, channelNote: null, clearanceStatus: "WAITING", customsTaxVnd: of === 1 ? snap.estimatedTaxVnd : null, state: "APPROVED", pollCount: 0, raw: { stage: "NOT_SENT", certificateId }, updatedAt: now };
      await r.results.upsert(result);
    }
    // Số tờ giảm giữa hai lần truyền (vd bị từ chối trước khi có số, sửa 120 → 90 dòng): bỏ kết quả nhánh thừa chưa từng khai.
    await r.results.deleteUnsentAbove(ctx.orgId, dossierId, of);
    return ok(row);
  });
  if (!created.ok) return created;
  await deps.declarations.markSubmitted(ctx, dossierId);
  await deps.dossiers.update(ctx.orgId, dossierId, { status: "SUBMITTED", step: "submit" });
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: created.value.id }, { jobId: `customs-send:${created.value.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok({ outboxId: created.value.id });
}

/**
 * Khai tạm (IDA/EDA) tờ khai nhánh `branch` từ tờ khai hiện tại – dùng cho chuỗi khai tạm nối tiếp (worker) và gửi lại sau mở lại.
 * Giữ bất biến 7 (tờ khai đã duyệt, HS đủ, không BLOCKER, đúng tuần tỷ giá) + guard của tờ; tờ 2..N dùng số tờ khai của tờ 1 (TK_FIC).
 * Idempotent: khóa outbox theo nhánh + phiên bản; đã có (job chạy lại / hai job song song – unique) → không tạo thêm, chỉ đẩy lại job nếu chưa từng xử lý.
 */
export async function enqueueBranchPreDeclare(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string, branch: number, mode: PreDeclareMode): Promise<Result<void>> {
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  if (mode.by === "chain" && (snap.status !== "SUBMITTED" || snap.version !== mode.version))
    return err(domainError("INVALID_STATE", `Tờ khai đã mở lại hoặc đổi phiên bản sau khi truyền (đã truyền v${mode.version}, hiện v${snap.version}) – không khai tạm tự động; duyệt lại rồi truyền lại`));
  if (mode.by === "user" && snap.status !== "APPROVED") return err(reasonError("NOT_APPROVED", "DECLARATION_NOT_REAPPROVED"));
  if (snap.unconfirmedHs > 0) return err(reasonError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n: snap.unconfirmedHs }));
  if (!sameRateWeek(snap.exchangeRateDate, vnDateOf(deps.clock.now())))
    return err(reasonError("RATE_WEEK_CHANGED", "RATE_WEEK_CHANGED_REBUILD", { week: weekStart(snap.exchangeRateDate) }));
  const blockers = await deps.validation.blockerFails(ctx.orgId, dossierId);
  if (blockers > 0) return err(reasonError("BLOCKER_FAILED", "BLOCKER_RULES_FAILED", { n: blockers }));
  const { first, target } = await deps.uow.asOrg(ctx, async (r) => ({ first: await r.results.get(ctx.orgId, dossierId, 1), target: await r.results.get(ctx.orgId, dossierId, branch) }));
  if (!target) return err(reasonError("INVALID_STATE", "NOT_SUBMITTED_YET"));
  const s = sheetOf(snap.payload, branch, branch === 1 ? null : first?.declarationNo ?? null);
  const gaps = gapsError(s);
  if (gaps) return err(gaps);
  const built = buildSheet(s);
  if (!built.ok) return built;

  const op = snap.payload.kind === "IDA" ? "IDA" : "EDA";
  const now = deps.clock.now();
  const key = outboxKey(dossierId, op, snap.version, 0, branch);
  const row: OutboxRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch, declarationId: snap.declarationId, operation: op, idempotencyKey: key, payload: { request: built.value.request, warnings: built.value.warnings, issues: built.value.issues, certificateId: target.raw?.certificateId }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now };
  const toSend = await deps.uow.asOrg(ctx, async (r): Promise<OutboxRow | null> => {
    const existing = await r.outbox.findByKey(ctx.orgId, key);
    if (existing) return existing.status === "PENDING" && existing.attempts === 0 ? existing : null;
    try {
      await r.outbox.insert(row);
    } catch (e) {
      // Job khác vừa tạo cùng khóa → đã được xếp gửi, không tạo trùng.
      if (/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) return null;
      throw e;
    }
    return row;
  });
  if (!toSend) return ok(undefined);
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: toSend.id }, { jobId: `customs-send:${toSend.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok(undefined);
}
