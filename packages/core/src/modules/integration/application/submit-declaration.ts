// Truyền tờ khai (ADR 0005 outbox): guard canSubmit → outbox IDA/EDA (idempotency_key) → declaration SUBMITTED → dossier SUBMITTED → job customs-send.
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { buildFptRequest } from "../domain/declaration-to-fpt.js";
import type { CustomsDeps, OutboxRow, ResultRow } from "./customs-ports.js";

export const outboxKey = (dossierId: string, op: string, version: number, retry = 0) => `${dossierId}:${op}:v${version}${retry ? `:retry${retry}` : ""}`;

export async function submitDeclaration(deps: CustomsDeps, ctx: Ctx, dossierId: string, certificateId: string): Promise<Result<{ outboxId: string }>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (dossier.status === "CANCELLED") return err(domainError("INVALID_STATE", "Hồ sơ đã hủy"));
  if (dossier.status === "SUBMITTED" || dossier.status === "CLEARED") return err(domainError("ALREADY_SUBMITTED", "Hồ sơ đã truyền"));
  if (dossier.status !== "APPROVED") return err(domainError("NOT_APPROVED", "Hồ sơ chưa ở trạng thái đã duyệt"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  if (!snap) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
  if (snap.status === "SUBMITTED") return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã được truyền – không gửi trùng"));
  if (snap.status !== "APPROVED") return err(domainError("NOT_APPROVED", "Tờ khai chưa được phê duyệt"));
  if (snap.unconfirmedHs > 0) return err(domainError("HS_UNCONFIRMED", `Còn ${snap.unconfirmedHs} mã HS chưa xác nhận`));
  const blockers = await deps.validation.blockerFails(ctx.orgId, dossierId);
  if (blockers > 0) return err(domainError("BLOCKER_FAILED", `Còn ${blockers} luật lỗi chặn truyền`));
  if (!certificateId || !(await deps.certificates.exists(ctx.orgId, certificateId))) return err(domainError("NO_CERT", "Chọn chứng thư số để ký"));

  const op = snap.payload.kind === "IDA" ? "IDA" : "EDA";
  const built = buildFptRequest(snap.payload);
  if (built.blockers.length) return err(domainError("BLOCKER_FAILED", `Tờ khai chưa truyền được: ${built.blockers.join("; ")}`));
  const now = deps.clock.now();
  const key = outboxKey(dossierId, op, snap.version);
  const created = await deps.uow.asOrg(ctx, async (r) => {
    const existing = await r.outbox.findByKey(ctx.orgId, key);
    if (existing) {
      // Lần trước crash sau khi tạo outbox mà chưa đẩy job → đẩy lại (jobId trùng là idempotent), vẫn báo đã truyền.
      if (existing.status === "PENDING" && existing.attempts === 0) await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: existing.id }, { jobId: `customs-send:${existing.id}` });
      return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã được truyền – không gửi trùng"));
    }
    const row: OutboxRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, declarationId: snap.declarationId, operation: op, idempotencyKey: key, payload: { request: built.request, warnings: built.warnings, issues: built.issues, certificateId }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now };
    try {
      await r.outbox.insert(row);
    } catch (e) {
      // Hai request song song: insert thứ hai vi phạm unique → coi như đã truyền.
      if (/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã được truyền – không gửi trùng"));
      throw e;
    }
    const result: ResultRow = { id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, externalId: null, declarationNo: null, channel: null, channelNote: null, clearanceStatus: "WAITING", customsTaxVnd: snap.estimatedTaxVnd, state: "APPROVED", pollCount: 0, raw: { progress: "APPROVED" }, updatedAt: now };
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
