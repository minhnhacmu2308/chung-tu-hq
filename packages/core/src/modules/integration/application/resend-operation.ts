// "Gửi lại" một nghiệp vụ: LUÔN tra IEX trước (ADR 0005); Hải quan đã ghi nhận → không gửi; chưa → outbox mới (…:retryN) và job.
import type { CustomsOperation, ResendResult } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { next } from "../domain/state-machine.js";
import { OPERATION_LABELS } from "./_customs-view.js";
import type { CustomsDeps } from "./customs-ports.js";
import { MAX_ATTEMPTS } from "./process-outbox.js";
import { outboxKey } from "./submit-declaration.js";

export async function resendOperation(deps: CustomsDeps, ctx: Ctx, dossierId: string, op: CustomsOperation): Promise<Result<ResendResult>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(ctx.orgId, dossierId));
  if (!result || !result.externalId) return err(domainError("NOT_FOUND", "Hồ sơ chưa truyền"));
  const now = () => deps.clock.now();

  await deps.uow.asOrg(ctx, (r) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, operation: "IEX", direction: "OUT", result: "OK", summary: "Tra cứu trạng thái trước khi gửi lại", payloadMasked: { nghiepVu: "IEX", soToKhai: result.declarationNo }, externalRef: result.externalId, at: now() }));
  const st = await deps.gateway.queryStatus(ctx.orgId, result.externalId, dossierId);
  const progress = result.raw?.progress ?? "APPROVED";
  const recorded = op === "IDA" || op === "EDA" ? !!st.declarationNo : op === "IDC" || op === "EDC" ? !!st.channel : op === "HYS" ? !!result.raw?.receiptNo : true;

  if (op === "IEX" || recorded) {
    const transition = progress === "DOCS_SENT" || progress === "DONE" ? next(result.state, progress, { type: "STATUS", cleared: st.cleared, ...(st.rejected ? { rejected: true } : {}) }) : null;
    await deps.uow.asOrg(ctx, async (r) => {
      await r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, operation: "IEX", direction: "IN", result: "OK", summary: op === "IEX" ? `Trạng thái tờ khai: ${st.status}` : `Hải quan đã ghi nhận ${op} – không gửi lại (trạng thái: ${st.status})`, payloadMasked: { nghiepVu: "IEX", trangThai: st.status, phanLuong: st.channel }, externalRef: result.externalId, at: now() });
      if (transition) await r.results.upsert({ ...result, state: transition.state, clearanceStatus: st.rejected ? "REJECTED" : st.cleared ? "CLEARED" : "INSPECTING", raw: { ...(result.raw ?? { progress }), progress: transition.progress, lastStatus: st.status }, updatedAt: now() });
    });
    if (st.cleared) await deps.dossiers.update(ctx.orgId, dossierId, { status: "CLEARED" });
    await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
    return ok({ resent: false, message: op === "IEX" ? `Trạng thái: ${st.status}` : `Hải quan đã ghi nhận ${op}, không cần gửi lại` });
  }

  const outbox = await deps.uow.asOrg(ctx, (r) => r.outbox.listForDossier(ctx.orgId, dossierId));
  const base = outbox.filter((o) => o.operation === op);
  const last = base.at(-1);
  if (!last) return err(domainError("INVALID_STATE", `Chưa tới bước ${op}`));
  if (last.status === "PENDING" && last.attempts < MAX_ATTEMPTS) return ok({ resent: false, message: `${OPERATION_LABELS[op]} đang được gửi` });
  if (last.status === "PENDING") await deps.uow.asOrg(ctx, (r) => r.outbox.update(last.id, { status: "FAILED", updatedAt: now() }));
  const version = Number(/:v(\d+)/.exec(last.idempotencyKey)?.[1] ?? "1");
  const key = outboxKey(dossierId, op, version, base.length);
  const row = { ...last, id: deps.idGen.next("msg"), idempotencyKey: key, status: "PENDING" as const, attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now(), updatedAt: now() };
  await deps.uow.asOrg(ctx, async (r) => {
    await r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, operation: "IEX", direction: "IN", result: "OK", summary: `Chưa ghi nhận ${op} – được phép gửi lại (trạng thái: ${st.status})`, payloadMasked: { nghiepVu: "IEX", trangThai: st.status }, externalRef: result.externalId, at: now() });
    await r.outbox.insert(row);
    if (result.state === "SEND_FAILED") {
      const t = next(result.state, progress, { type: "RETRY" });
      if (t) await r.results.upsert({ ...result, state: t.state, raw: { ...(result.raw ?? { progress }), progress: t.progress }, updatedAt: now() });
    }
  });
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: row.id }, { jobId: `customs-send:${row.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok({ resent: true, message: `Đang gửi lại ${OPERATION_LABELS[op].toLowerCase()}` });
}
