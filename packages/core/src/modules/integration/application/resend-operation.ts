// "Gửi lại" một nghiệp vụ bị lỗi: LUÔN tra trạng thái trước (ADR 0005); Hải quan đã ghi nhận → không gửi; chưa → outbox mới (…:retryN) và job.
import { baseOp, CUSTOMS_OPERATIONS, queryOpFor, sameRateWeek, vnDateOf, weekStart } from "@kb/contracts";
import type { CustomsOperation, ResendResult } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import { OPERATION_LABELS } from "./_customs-view.js";
import type { CustomsDeps } from "./customs-ports.js";
import { performOperation } from "./perform-operation.js";
import { MAX_ATTEMPTS } from "./process-outbox.js";
import { outboxKey } from "./submit-declaration.js";

export async function resendOperation(deps: CustomsDeps, ctx: Ctx, dossierId: string, op: CustomsOperation): Promise<Result<ResendResult>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const result = await deps.uow.asOrg(ctx, (r) => r.results.get(ctx.orgId, dossierId));
  if (!result || !result.externalId) return err(domainError("NOT_FOUND", "Hồ sơ chưa truyền"));
  // Tra cứu: dùng chung với nút IID/IEX.
  if (CUSTOMS_OPERATIONS[op].kind === "query") {
    const q = await performOperation(deps, ctx, dossierId, op);
    return q.ok ? ok({ resent: false, message: q.value.message }) : q;
  }
  const now = () => deps.clock.now();
  const qop = queryOpFor(dossier.direction);

  await deps.uow.asOrg(ctx, (r) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, operation: qop, direction: "OUT", result: "OK", summary: "Tra cứu trạng thái trước khi gửi lại", payloadMasked: { nghiepVu: qop, soToKhai: result.declarationNo }, externalRef: result.externalId, at: now() }));
  const st = await deps.gateway.queryStatus(ctx.orgId, result.externalId, dossierId);
  await meterSafely(deps.usage, { orgId: ctx.orgId, dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: qop, quantity: 1, meta: { beforeResend: op } });
  const stage = stageOf(result);
  const b = baseOp(op);
  // Chỉ nhận biết chắc được: số tờ khai của lần khai đầu, phân luồng của khai chính thức, số tiếp nhận HYS.
  const recorded = b === "IDA" ? stage === "NOT_SENT" && !!st.declarationNo : b === "IDC" ? stage === "PRE_DECLARED" && !!st.channel : op === "HYS" ? !!result.raw?.receiptNo && result.raw?.done?.includes("HYS") === true : false;

  if (recorded) {
    await deps.uow.asOrg(ctx, (r) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, operation: qop, direction: "IN", result: "OK", summary: `Hải quan đã ghi nhận ${op} – không gửi lại (trạng thái: ${st.status})`, payloadMasked: { nghiepVu: qop, trangThai: st.status, phanLuong: st.channel }, externalRef: result.externalId, at: now() }));
    await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
    return ok({ resent: false, message: `Hải quan đã ghi nhận ${op}, không cần gửi lại – bấm Tra cứu để cập nhật` });
  }

  // Khai lại IDA/EDA chưa được ghi nhận = đăng ký mới: tỷ giá phải thuộc tuần đăng ký (như lúc truyền).
  if (b === "IDA") {
    const snap = await deps.declarations.get(ctx.orgId, dossierId);
    if (snap && !sameRateWeek(snap.exchangeRateDate, vnDateOf(deps.clock.now())))
      return err(domainError("RATE_WEEK_CHANGED", `Tờ khai dùng tỷ giá tuần ${weekStart(snap.exchangeRateDate)} – đã sang tuần tỷ giá mới. Mở lại tờ khai để dựng lại với tỷ giá tuần này rồi duyệt và truyền lại`));
  }
  const outbox = await deps.uow.asOrg(ctx, (r) => r.outbox.listForDossier(ctx.orgId, dossierId));
  const base = outbox.filter((o) => o.operation === op);
  const last = base.at(-1);
  if (!last) return err(domainError("INVALID_STATE", `Chưa gửi ${op} lần nào`));
  if (last.status === "PENDING" && last.attempts < MAX_ATTEMPTS) return ok({ resent: false, message: `${OPERATION_LABELS[op]} đang được gửi` });
  if (last.status === "SENT") return err(domainError("INVALID_STATE", `${OPERATION_LABELS[op]} đã thành công – không gửi lại`));
  if (last.status === "PENDING") await deps.uow.asOrg(ctx, (r) => r.outbox.update(last.id, { status: "FAILED", updatedAt: now() }));
  const version = Number(/:v(\d+)/.exec(last.idempotencyKey)?.[1] ?? "1");
  const key = /:n\d+$/.test(last.idempotencyKey) ? `${last.idempotencyKey}:retry${base.length}` : outboxKey(dossierId, op, version, base.length);
  const row = { ...last, id: deps.idGen.next("msg"), idempotencyKey: key, status: "PENDING" as const, attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now(), updatedAt: now() };
  await deps.uow.asOrg(ctx, async (r) => {
    await r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, operation: qop, direction: "IN", result: "OK", summary: `Chưa ghi nhận ${op} – được phép gửi lại (trạng thái: ${st.status})`, payloadMasked: { nghiepVu: qop, trangThai: st.status }, externalRef: result.externalId, at: now() });
    await r.outbox.insert(row);
    if (result.state === "SEND_FAILED") await r.results.upsert({ ...result, state: coarseState(stage), updatedAt: now() });
  });
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: row.id }, { jobId: `customs-send:${row.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok({ resent: true, message: `Đang gửi lại ${OPERATION_LABELS[op].toLowerCase()}` });
}
