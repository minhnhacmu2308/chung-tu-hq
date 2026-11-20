// Khai báo định danh hàng hóa (FPT V5IdentifierReq / V5IdentifierRes – KHAI BAO LAY MA DINH DANH v1.1): xin số định danh + mã QR để đưa hàng qua
// khu vực giám sát. Gửi riêng theo hồ sơ (không thuộc tờ khai, không đọc giai đoạn truyền). Mỗi lần gửi = một bản ghi `customs_identifiers` (attempt).
// - Web: sendIdentifier → bản ghi SENDING + job `identifier-send` (gọi FPT luôn qua worker – lời gọi thật có thể mất ~45 giây).
// - Worker: processIdentifier → gateway.sendIdentifier. Cổng thật trả kết quả ngay (số định danh, QR) → ACCEPTED; chỉ trả REF_ID → lưu REF_ID, xếp
//   job `identifier-poll` hỏi V5IdentifierRes mỗi IDENTIFIER_POLL_DELAY_MS tới IDENTIFIER_MAX_POLLS lần rồi NO_RESPONSE (người khai bấm "Hỏi kết quả").
// Lỗi nghiệp vụ (cổng từ chối, chưa cấu hình tài khoản VNACCS) → REJECTED + errors, không retry; lỗi tạm (mạng/5xx) → ném để BullMQ retry.
import type { IdentifierRecord, IdentifierRequest, IdentifierView } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { asOrgId, asUserId, type OrgId, type UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { MAX_ATTEMPTS } from "./_outbox.js";
import type { CustomsDeps, GatewayError, IdentifierGatewayRequest, IdentifierGatewayResult, IdentifierRow } from "./customs-ports.js";
import { isDuplicate, KVGS_ROLES } from "./kvgs.js";
import { isDomainError } from "./poll-kvgs.js";

export const IDENTIFIER_POLL_DELAY_MS = 30_000;
export const IDENTIFIER_MAX_POLLS = 40;

/**
 * Payload job `identifier-send`. `attempt` = lần gửi tạo ra job: dòng lô Gửi lại giữ id, tăng attempt → job còn sót của lần trước (khác attempt) bỏ qua.
 * Job xếp trước khi có trường này không có → coi như lần gửi hiện tại.
 */
export type IdentifierSendInput = { orgId: string; userId: string; id: string; attempt?: number | undefined };
/** Payload job `identifier-poll`: `n` = lần hỏi thứ n (1-based); `manual` = một lượt do người khai bấm (không xếp lượt kế, không đổi sang NO_RESPONSE). */
export type IdentifierPollInput = IdentifierSendInput & { n: number; manual?: boolean };

type ActorCtx = { orgId: OrgId; userId: UserId };
type Patch = Partial<Omit<IdentifierRow, "id" | "orgId" | "dossierId" | "attempt" | "createdAt">>;

const actor = (input: { orgId: string; userId: string }): ActorCtx => ({ orgId: asOrgId(input.orgId), userId: asUserId(input.userId) });
const errorsOf = (e: GatewayError[] | null) => (e ?? []).map((x) => ({ code: x.code, message: x.message, ...(x.solution ? { solution: x.solution } : {}), ...(x.field ? { field: x.field } : {}), ...(x.line ? { line: x.line } : {}) }));

/** Job của lần gửi khác lần hiện tại của bản ghi (sót lại sau Gửi lại) → bỏ qua. */
const staleJob = (input: { attempt?: number | undefined }, row: IdentifierRow) => input.attempt !== undefined && input.attempt !== row.attempt;

/** jobId gửi theo lần gửi (attempt): job cũ đã hoàn tất không chặn lần gửi lại cùng bản ghi (lô). */
export const identifierSendJobId = (row: Pick<IdentifierRow, "id" | "attempt">) => `identifier-send:${row.id}:${row.attempt}`;
/** Khóa tính phí theo bản ghi; bản ghi lô gửi lại (attempt > 1) thêm attempt – lần gửi lại là lời gọi FPT mới. Attempt 1 giữ khóa cũ (job đang chạy lúc nâng cấp không tính hai lần). */
const meterKey = (row: Pick<IdentifierRow, "id" | "attempt">) => (row.attempt > 1 ? `${row.id}:${row.attempt}` : row.id);

export const identifierRecord = (row: IdentifierRow): IdentifierRecord => ({
  attempt: row.attempt, status: row.status, request: row.request, refId: row.refId, receiptNo: row.receiptNo, receiptDate: row.receiptDate, customsState: row.customsState,
  identifierNo: row.identifierNo, identifiedOn: row.identifiedOn, qrPng: row.qrPng, resultText: row.resultText, errors: errorsOf(row.errors), sentAt: row.sentAt.toISOString(),
});

export function identifierView(dossierId: string, row: IdentifierRow | null): IdentifierView {
  return { dossierId, latest: row ? identifierRecord(row) : null };
}

/** Kết quả cổng → các cột của bản ghi (chỉ trường cổng có trả; không xóa dữ liệu đã có). */
function resultPatch(res: IdentifierGatewayResult): Patch {
  return {
    ...(res.refId ? { refId: res.refId } : {}), ...(res.receiptNo ? { receiptNo: res.receiptNo } : {}), ...(res.receiptDate ? { receiptDate: res.receiptDate } : {}),
    ...(res.customsState ? { customsState: res.customsState } : {}), ...(res.identifierNo ? { identifierNo: res.identifierNo } : {}), ...(res.identifiedOn ? { identifiedOn: res.identifiedOn } : {}),
    ...(res.qrPng ? { qrPng: res.qrPng } : {}), ...(res.resultText ? { resultText: res.resultText } : {}),
  };
}

/** Xem kết quả khai báo định danh của hồ sơ (mọi thành viên). */
export async function getIdentifier(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<IdentifierView>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  return ok(identifierView(dossierId, await deps.uow.asOrg(ctx, (r) => r.identifiers.latest(ctx.orgId, dossierId))));
}

/** Gửi khai báo định danh: đang có lần gửi chờ kết quả → KVGS_ALREADY_SENDING (không tạo lời gọi thứ hai). Input đã parse Zod ở route. */
export async function sendIdentifier(deps: CustomsDeps, ctx: Ctx, dossierId: string, input: IdentifierRequest): Promise<Result<IdentifierView>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const busy = () => err(reasonError("INVALID_STATE", "KVGS_ALREADY_SENDING"));
  const created = await deps.uow.asOrg(ctx, async (r): Promise<Result<IdentifierRow>> => {
    const latest = await r.identifiers.latest(ctx.orgId, dossierId);
    if (latest?.status === "SENDING") return busy();
    const now = deps.clock.now();
    const row: IdentifierRow = {
      id: deps.idGen.next("idn"), orgId: ctx.orgId, dossierId, attempt: (latest?.attempt ?? 0) + 1, status: "SENDING", request: input, refId: null, receiptNo: null, receiptDate: null,
      customsState: null, identifierNo: null, identifiedOn: null, qrPng: null, resultText: null, errors: null, sendAttempts: 0, sentBy: ctx.userId, sentAt: now, batchId: null, batchIndex: null, usedAt: null, usedByDossierId: null, deletedAt: null, deletedBy: null, createdAt: now, updatedAt: now,
    };
    await r.identifiers.insert(row);
    return ok(row);
  }).catch((e: unknown) => {
    // Hai lần bấm Gửi song song: bên chậm vi phạm unique (đang SENDING / trùng attempt).
    if (isDuplicate(e)) return busy();
    throw e;
  });
  if (!created.ok) return created;
  const row = created.value;
  await deps.queue.enqueue("identifier-send", { orgId: ctx.orgId, userId: ctx.userId, id: row.id, attempt: row.attempt } satisfies IdentifierSendInput, { jobId: identifierSendJobId(row) });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return ok(identifierView(dossierId, row));
}

/** Ghi patch rồi báo giao diện (SSE); dòng lô vừa xong (có số / từ chối / không phản hồi) → kiểm lô đã xong hết chưa. */
async function save(deps: CustomsDeps, ctx: ActorCtx, row: IdentifierRow, patch: Patch): Promise<void> {
  await deps.uow.asOrg(ctx, (r) => r.identifiers.update(ctx.orgId, row.id, { ...patch, updatedAt: deps.clock.now() }));
  if (row.dossierId) await deps.dossiers.publish(ctx.orgId, row.dossierId, { type: "customs.message" });
  if (row.batchId && patch.status && patch.status !== "SENDING") await enqueueBatchDoneIfFinished(deps, ctx, row.batchId);
}

/** Payload job `identifier-batch-done`. */
export type IdentifierBatchDoneInput = { orgId: string; batchId: string };

/**
 * Lô không còn dòng SENDING → xếp job báo lô xong (kiểm SENDING bỏ dòng đã xóa mềm). jobId theo tổng attempt của lô (cả dòng đã xóa): hai dòng cuối xong cùng lúc chỉ ra
 * một job (BullMQ bỏ jobId trùng); mỗi lần gửi lại (tổng tăng 1, kể cả dòng thứ hai cùng lên attempt 2) → lần xong sau báo lại.
 */
async function enqueueBatchDoneIfFinished(deps: CustomsDeps, ctx: ActorCtx, batchId: string): Promise<void> {
  const all = await deps.uow.asOrg(ctx, (r) => r.identifiers.listByBatch(ctx.orgId, batchId));
  const rows = all.filter((x) => !x.deletedAt);
  if (!rows.length || rows.some((x) => x.status === "SENDING")) return;
  // Tổng tính cả dòng đã xóa mềm: attempt dòng xóa không đổi nên tổng chỉ tăng, jobId không lặp lại sau khi xóa.
  const sumAttempts = all.reduce((n, x) => n + x.attempt, 0);
  await deps.queue.enqueue("identifier-batch-done", { orgId: ctx.orgId, batchId } satisfies IdentifierBatchDoneInput, { jobId: `identifier-batch-done:${batchId}:${sumAttempts}` });
}

/** Lượt hỏi mang attempt của lần gửi (job cũ thiếu trường → lấy của bản ghi; nơi gọi đã bỏ job lệch attempt). */
const enqueuePoll = (deps: CustomsDeps, input: IdentifierSendInput, row: IdentifierRow, n: number) => {
  const attempt = input.attempt ?? row.attempt;
  return deps.queue.enqueue("identifier-poll", { orgId: input.orgId, userId: input.userId, id: input.id, attempt, n } satisfies IdentifierPollInput, { jobId: `identifier-poll:${input.id}:${attempt}:${n}`, delayMs: IDENTIFIER_POLL_DELAY_MS });
};

/** Yêu cầu gửi cổng: USER_ID ô panel, trống → tài khoản VNACCS của doanh nghiệp (gateway thật báo chưa cấu hình nếu vẫn trống). */
async function gatewayRequest(deps: CustomsDeps, row: IdentifierRow): Promise<IdentifierGatewayRequest> {
  const userId = row.request.userId?.trim() || ((await deps.vnaccsUserId?.(row.orgId)) ?? "");
  return { ...row.request, userId, ...(row.dossierId ? { dossierId: row.dossierId } : {}) };
}

/** Kết quả cuối (ACCEPTED/REJECTED) hoặc còn chờ; trả có cần hỏi tiếp không. */
async function applyResult(deps: CustomsDeps, ctx: ActorCtx, row: IdentifierRow, res: IdentifierGatewayResult): Promise<"DONE" | "PENDING"> {
  const base = resultPatch(res);
  if (res.state === "ACCEPTED") {
    await save(deps, ctx, row, { ...base, status: "ACCEPTED", errors: null });
    return "DONE";
  }
  if (res.state === "REJECTED") {
    const errors = res.errors?.length ? res.errors : [{ code: "E-IDENT-REJECTED", message: res.resultText?.trim() || "Hải quan từ chối khai báo định danh" }];
    await save(deps, ctx, row, { ...base, status: "REJECTED", errors });
    return "DONE";
  }
  // Còn chờ mà cổng không trả gì mới: vẫn ghi updatedAt – stuck-sweeper (STUCK_IDENTIFIER_MS) không cắt chuỗi hỏi đang chạy (40 × 30 giây > 15 phút).
  if (Object.keys(base).length) await save(deps, ctx, row, base);
  else await deps.uow.asOrg(ctx, (r) => r.identifiers.update(ctx.orgId, row.id, { updatedAt: deps.clock.now() }));
  return "PENDING";
}

/** Worker `identifier-send`: gọi V5IdentifierReq đúng một lần cho mỗi bản ghi (job chạy lại khi đã có REF_ID → chỉ xếp lại job hỏi kết quả). */
export async function processIdentifier(deps: CustomsDeps, input: IdentifierSendInput): Promise<Result<{ status: IdentifierRow["status"] }>> {
  const ctx = actor(input);
  const row = await deps.uow.asOrg(ctx, (r) => r.identifiers.get(ctx.orgId, input.id));
  if (!row) return err(domainError("NOT_FOUND", "Không tìm thấy khai báo định danh"));
  if (row.status !== "SENDING" || staleJob(input, row)) return ok({ status: row.status });
  // Crash giữa lúc ghi REF_ID và lúc xếp job hỏi → không gửi lại, chỉ bảo đảm job hỏi tồn tại (jobId cố định nên không nhân đôi).
  if (row.refId) {
    await enqueuePoll(deps, input, row, 1);
    return ok({ status: row.status });
  }
  const reject = async (errors: GatewayError[]) => {
    await save(deps, ctx, row, { status: "REJECTED", errors });
    return ok({ status: "REJECTED" as const });
  };
  if (row.sendAttempts >= MAX_ATTEMPTS) return reject([{ code: "E-SEND", message: `Không gửi được khai báo định danh sau ${row.sendAttempts} lần thử – gửi lại` }]);
  await deps.uow.asOrg(ctx, (r) => r.identifiers.update(ctx.orgId, row.id, { sendAttempts: row.sendAttempts + 1, updatedAt: deps.clock.now() }));

  let res: IdentifierGatewayResult;
  try {
    res = await deps.gateway.sendIdentifier(input.orgId, await gatewayRequest(deps, row), `identifier:${row.id}`);
  } catch (e) {
    // Lỗi vĩnh viễn (chưa cấu hình tài khoản VNACCS, dữ liệu sai…) → REJECTED, không tính phí; lỗi tạm → BullMQ retry.
    if (isDomainError(e)) return reject([{ code: e.code, message: e.message ?? e.code }]);
    throw e;
  }
  // Cổng đã xử lý thông điệp (kể cả từ chối) → chi phí; khóa theo bản ghi (job chạy lại không tính thêm).
  await meterSafely(deps.usage, { orgId: input.orgId, dossierId: row.dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", operation: "V5IdentifierReq", quantity: 1, dedupeKey: `customs:identifier:${meterKey(row)}`, meta: { identifierId: row.id } });
  if (res.state === "PENDING" && !res.refId) return reject(res.errors?.length ? res.errors : [{ code: "E-NO-REFID", message: "Cổng không trả mã tham chiếu (REF_ID) – gửi lại" }]);
  const outcome = await applyResult(deps, ctx, row, res);
  if (outcome === "PENDING") await enqueuePoll(deps, input, row, 1);
  return ok({ status: outcome === "PENDING" ? "SENDING" : res.state === "ACCEPTED" ? "ACCEPTED" : "REJECTED" });
}

/** Worker `identifier-poll` (và "Hỏi kết quả" của người khai – manual): V5IdentifierRes theo REF_ID. */
export async function pollIdentifier(deps: CustomsDeps, input: IdentifierPollInput): Promise<Result<{ again: boolean }>> {
  const ctx = actor(input);
  const row = await deps.uow.asOrg(ctx, (r) => r.identifiers.get(ctx.orgId, input.id));
  if (!row) return err(domainError("NOT_FOUND", "Không tìm thấy khai báo định danh"));
  if ((row.status !== "SENDING" && row.status !== "NO_RESPONSE") || !row.refId || staleJob(input, row)) return ok({ again: false });
  const refId = row.refId;
  let res: IdentifierGatewayResult;
  try {
    res = await deps.gateway.identifierResult(input.orgId, { ...(await gatewayRequest(deps, row)), refId });
  } catch (e) {
    if (!isDomainError(e)) throw e;
    // Đã có REF_ID = Hải quan đã nhận khai báo: lỗi khi HỎI (phản hồi sai dạng, chưa cấu hình tài khoản…) không phải bị từ chối →
    // NO_RESPONSE để người khai bấm "Hỏi kết quả" lại; lượt bấm tay trả lỗi để giao diện báo lý do.
    if (row.status !== "NO_RESPONSE") await save(deps, ctx, row, { status: "NO_RESPONSE" });
    return input.manual ? err(domainError(e.code, e.message ?? e.code)) : ok({ again: false });
  }
  await meterSafely(deps.usage, { orgId: input.orgId, dossierId: row.dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: "V5IdentifierRes", quantity: 1, ...(input.manual ? {} : { dedupeKey: `identifier-poll:${meterKey(row)}:${input.n}` }), meta: { refId, attempt: input.n, ...(input.manual ? { manual: true } : {}) } });
  if ((await applyResult(deps, ctx, row, res)) === "DONE" || input.manual) return ok({ again: false });
  if (input.n >= IDENTIFIER_MAX_POLLS) {
    await save(deps, ctx, row, { status: "NO_RESPONSE" });
    return ok({ again: false });
  }
  await enqueuePoll(deps, input, row, input.n + 1);
  return ok({ again: true });
}

/** "Hỏi kết quả": lần gửi mới nhất đang chờ (SENDING / NO_RESPONSE, đã có REF_ID) → hỏi một lượt ngay. Không có → INVALID_STATE. */
export async function pollIdentifierNow(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<IdentifierView>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const latest = await deps.uow.asOrg(ctx, (r) => r.identifiers.latest(ctx.orgId, dossierId));
  if (!latest || (latest.status !== "SENDING" && latest.status !== "NO_RESPONSE") || !latest.refId) return err(domainError("INVALID_STATE", "Không có khai báo định danh đang chờ phản hồi"));
  const polled = await pollIdentifier(deps, { orgId: ctx.orgId, userId: ctx.userId, id: latest.id, n: 1, manual: true });
  if (!polled.ok) return polled;
  return getIdentifier(deps, ctx, dossierId);
}

/**
 * Lần gửi SENDING không đổi gì quá lâu (mặc định 15 phút) coi như job đã mất. Gửi thật ~45 giây, mỗi lượt thử/hỏi đều ghi `updatedAt`
 * (lượt hỏi cách nhau IDENTIFIER_POLL_DELAY_MS, backoff thử lại tối đa vài phút) → 15 phút không đụng = không còn job nào.
 */
export const STUCK_IDENTIFIER_MS = 15 * 60_000;

/**
 * Job stuck-sweeper: ghi bản ghi SENDING và đẩy job không cùng transaction → Redis lỗi đúng lúc đó làm bản ghi kẹt SENDING mãi
 * (Gửi lại bị chặn KVGS_ALREADY_SENDING, Hỏi kết quả chưa có REF_ID). Chưa có REF_ID → đẩy lại `identifier-send` (jobId chuẩn, giới hạn
 * sendAttempts vẫn áp dụng); đã có REF_ID → NO_RESPONSE để người khai bấm "Hỏi kết quả".
 */
export async function requeueStuckIdentifiers(deps: CustomsDeps, input: { orgId: string; now?: Date; olderThanMs?: number }): Promise<{ requeued: string[]; noResponse: string[] }> {
  const now = input.now ?? deps.clock.now();
  const before = new Date(now.getTime() - (input.olderThanMs ?? STUCK_IDENTIFIER_MS));
  const ctx = actor({ orgId: input.orgId, userId: "" });
  const stuck = await deps.uow.asOrg(ctx, (r) => r.identifiers.listStuckSending(input.orgId, before));
  const out = { requeued: [] as string[], noResponse: [] as string[] };
  for (const row of stuck) {
    if (row.refId) {
      await save(deps, ctx, row, { status: "NO_RESPONSE" });
      out.noResponse.push(row.id);
    } else {
      await deps.queue.enqueue("identifier-send", { orgId: input.orgId, userId: row.sentBy, id: row.id, attempt: row.attempt } satisfies IdentifierSendInput, { jobId: identifierSendJobId(row) });
      out.requeued.push(row.id);
    }
  }
  return out;
}

/**
 * Hết số lần thử của job (lỗi tạm kéo dài): chưa gửi được (chưa có REF_ID) → REJECTED để người khai gửi lại; đã có REF_ID → NO_RESPONSE (bấm Hỏi kết quả).
 */
export async function markIdentifierFailed(deps: CustomsDeps, input: { orgId: string; id: string; reason: string; attempt?: number }): Promise<void> {
  const ctx = actor({ orgId: input.orgId, userId: "" });
  const row = await deps.uow.asOrg(ctx, (r) => r.identifiers.get(ctx.orgId, input.id));
  if (!row || row.status !== "SENDING" || staleJob(input, row)) return;
  await save(deps, ctx, row, row.refId ? { status: "NO_RESPONSE" } : { status: "REJECTED", errors: [{ code: "E-SEND", message: `Không gửi được khai báo định danh: ${input.reason} – gửi lại` }] });
}
