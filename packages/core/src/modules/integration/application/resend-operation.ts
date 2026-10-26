// "Gửi lại" một nghiệp vụ bị lỗi: LUÔN tra trạng thái trước (ADR 0005); Hải quan đã ghi nhận → không gửi; chưa → outbox mới (…:retryN) và job.
// Lô nhiều tờ: tờ chưa có số (NOT_SENT) mà lần khai tạm đã ghim chưa từng có externalId (hết lượt thử / lỗi trước khi FPT nhận) → không có gì để tra,
// gửi lại nguyên thông điệp đã ghim (kiểm ghim như mọi lần gửi lại) – chuỗi nối tiếp chạy tiếp từ tờ đó (spec §6.2.3). Lô một tờ: như trước.
import { baseOp, CUSTOMS_OPERATIONS, isContentOperation, queryOpFor, sameRateWeek, vnDateOf, weekStart } from "@kb/contracts";
import type { CustomsOperation, ResendResult } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { coarseState, stageOf } from "../domain/state-machine.js";
import { OPERATION_LABELS } from "./_customs-view.js";
import type { CustomsDeps } from "./customs-ports.js";
import { performOperation } from "./perform-operation.js";
import { MAX_ATTEMPTS } from "./process-outbox.js";
import { outboxKey, pinOfOutbox, stalePinReason } from "./branch-send.js";

/** `branch`: tờ khai nhánh (mặc định 1). Gửi lại nội dung tờ k (lần truyền có ghim) thành công → worker nối tiếp tờ sau. */
export async function resendOperation(deps: CustomsDeps, ctx: Ctx, dossierId: string, op: CustomsOperation, branch = 1): Promise<Result<ResendResult>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  // HYS khai bằng bộ hồ sơ đính kèm; gửi lại bộ bị lỗi là việc của bộ (khai bộ mới), không phải nghiệp vụ của tờ.
  if (op === "HYS") return err(reasonError("INVALID_STATE", "HYS_USE_SUBMISSION"));
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const { result, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ result: await r.results.get(ctx.orgId, dossierId, branch), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId) }));
  const base = outbox.filter((o) => o.operation === op && o.branch === branch);
  const last = base.at(-1);
  // Khai tạm đã ghim (lô nhiều tờ) chưa từng được FPT nhận: không có externalId để tra trạng thái.
  const unsentPinned = !!result && !result.externalId && stageOf(result) === "NOT_SENT" && baseOp(op) === "IDA" && !!last && pinOfOutbox(last) !== undefined;
  if (!result || (!result.externalId && !unsentPinned)) return err(domainError("NOT_FOUND", "Hồ sơ chưa truyền"));
  // Tra cứu: dùng chung với nút IID/IEX.
  if (CUSTOMS_OPERATIONS[op].kind === "query") {
    const q = await performOperation(deps, ctx, dossierId, op, branch);
    return q.ok ? ok({ resent: false, message: q.value.message }) : q;
  }
  const now = () => deps.clock.now();
  const qop = queryOpFor(dossier.direction);

  const stage = stageOf(result);
  const b = baseOp(op);
  const externalId = result.externalId;
  const st = externalId ? await queryBeforeResend(deps, ctx, dossierId, branch, op, qop, result.declarationNo, externalId) : null;
  // Chỉ nhận biết chắc được: số tờ khai của lần khai đầu, phân luồng của khai chính thức.
  const recorded = !st ? false : b === "IDA" ? stage === "NOT_SENT" && !!st.declarationNo : b === "IDC" ? stage === "PRE_DECLARED" && !!st.channel : false;

  if (recorded && st) {
    await deps.uow.asOrg(ctx, (r) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch, operation: qop, direction: "IN", result: "OK", summary: `Hải quan đã ghi nhận ${op} – không gửi lại (trạng thái: ${st.status})`, payloadMasked: { nghiepVu: qop, trangThai: st.status, phanLuong: st.channel }, externalRef: result.externalId, at: now() }));
    await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
    return ok({ resent: false, message: `Hải quan đã ghi nhận ${op}, không cần gửi lại – bấm Tra cứu để cập nhật` });
  }

  // Khai lại IDA/EDA chưa được ghi nhận = đăng ký mới: tỷ giá phải thuộc tuần đăng ký (như lúc truyền).
  if (b === "IDA") {
    const snap = await deps.declarations.get(ctx.orgId, dossierId);
    if (snap && !sameRateWeek(snap.exchangeRateDate, vnDateOf(deps.clock.now())))
      return err(domainError("RATE_WEEK_CHANGED", `Tờ khai dùng tỷ giá tuần ${weekStart(snap.exchangeRateDate)} – đã sang tuần tỷ giá mới. Mở lại tờ khai để dựng lại với tỷ giá tuần này rồi duyệt và truyền lại`));
  }
  if (!last) return err(domainError("INVALID_STATE", `Chưa gửi ${op} lần nào`));
  if (last.status === "PENDING" && last.attempts < MAX_ATTEMPTS) {
    // attempts = 0: có thể lần trước ghi outbox xong nhưng chưa kịp đẩy job → đẩy lại (jobId trùng là idempotent) thay vì báo "đang gửi" mãi.
    if (last.attempts === 0) await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: last.id }, { jobId: `customs-send:${last.id}` });
    return ok({ resent: false, message: `${OPERATION_LABELS[op]} đang được gửi` });
  }
  if (last.status === "SENT") return err(domainError("INVALID_STATE", `${OPERATION_LABELS[op]} đã thành công – không gửi lại`));
  // Gửi lại nguyên thông điệp nội dung đã dựng: outbox có ghim (tờ 2..N / lô nhiều tờ) chỉ gửi khi tờ khai còn SUBMITTED đúng phiên bản + lần duyệt đó
  // (không gửi nội dung cũ sau khi mở lại/duyệt lại). Khóa theo lượt không phiên bản (`:n<k>`) → guard thường như tờ 1.
  if (isContentOperation(op) && op !== "AMA" && stalePinReason(await deps.declarations.get(ctx.orgId, dossierId), last))
    return err(domainError("INVALID_STATE", `Tờ ${branch}: tờ khai đã mở lại hoặc đổi phiên bản – không gửi lại nội dung cũ; duyệt lại rồi truyền lại`));
  if (last.status === "PENDING") await deps.uow.asOrg(ctx, (r) => r.outbox.update(last.orgId, last.id, { status: "FAILED", updatedAt: now() }));
  const version = Number(/:v(\d+)/.exec(last.idempotencyKey)?.[1] ?? "1");
  // Khóa nhánh ≥ 2 kết thúc bằng :b<no> – lần gửi lại giữ hậu tố nhánh ở cuối (nhánh 1 giữ dạng cũ).
  const suffix = branch > 1 ? `:b${branch}` : "";
  const lastKey = suffix && last.idempotencyKey.endsWith(suffix) ? last.idempotencyKey.slice(0, -suffix.length) : last.idempotencyKey;
  const key = /:n\d+$/.test(lastKey) ? `${lastKey}:retry${base.length}${suffix}` : outboxKey(dossierId, op, version, base.length, branch);
  // `...last` giữ payload.chain: Gửi lại IDC/IDE bị từ chối trong chuỗi khai chính thức cả lô thành công thì chuỗi nối tiếp tờ sau.
  const row = { ...last, id: deps.idGen.next("msg"), idempotencyKey: key, status: "PENDING" as const, attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now(), updatedAt: now() };
  await deps.uow.asOrg(ctx, async (r) => {
    if (st) await r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch, operation: qop, direction: "IN", result: "OK", summary: `Chưa ghi nhận ${op} – được phép gửi lại (trạng thái: ${st.status})`, payloadMasked: { nghiepVu: qop, trangThai: st.status }, externalRef: result.externalId, at: now() });
    await r.outbox.insert(row);
    if (result.state === "SEND_FAILED") await r.results.upsert({ ...result, state: coarseState(stage), updatedAt: now() });
  });
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: row.id }, { jobId: `customs-send:${row.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok({ resent: true, message: `Đang gửi lại ${OPERATION_LABELS[op].toLowerCase()}` });
}

/** Tra trạng thái trước khi gửi lại (ADR 0005): ghi nhật ký OUT + chi phí tra cứu. */
async function queryBeforeResend(deps: CustomsDeps, ctx: Ctx, dossierId: string, branch: number, op: CustomsOperation, qop: CustomsOperation, declarationNo: string | null, externalId: string) {
  await deps.uow.asOrg(ctx, (r) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch, operation: qop, direction: "OUT", result: "OK", summary: "Tra cứu trạng thái trước khi gửi lại", payloadMasked: { nghiepVu: qop, soToKhai: declarationNo }, externalRef: externalId, at: deps.clock.now() }));
  const st = await deps.gateway.queryStatus(ctx.orgId, externalId, dossierId);
  await meterSafely(deps.usage, { orgId: ctx.orgId, dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: qop, quantity: 1, meta: { beforeResend: op } });
  return st;
}
