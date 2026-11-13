// Worker `kvgs-poll`: hỏi kết quả danh sách container (V5ContainerRes) theo REF_ID tới khi có phản hồi. KVGS (bảng kê) là một lời gọi đồng bộ
// (POST /api/KVGS) – xử lý xong trong customs-send (process-kvgs), không poll.
// PENDING → lặp mỗi KVGS_POLL_DELAY_MS tới KVGS_MAX_POLLS lần rồi NO_RESPONSE (người khai bấm "Lấy phản hồi" – pollKvgsNow – để hỏi tiếp);
// ACCEPTED → số tiếp nhận / ngày; REJECTED → lỗi Hải quan. Lỗi mạng/5xx → ném (BullMQ retry); lỗi nghiệp vụ của gateway (chưa hỗ trợ…) → REJECTED, không retry.
import { z } from "zod";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, type DomainError } from "../../../shared/errors.js";
import { asOrgId, asUserId, type OrgId, type UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { loadRefRequests } from "./_kvgs-request.js";
import type { ContainerListRecord, CustomsDeps, CustomsRepos, GatewayError, KvgsSheetRecord, MessageRow } from "./customs-ports.js";
import { KVGS_ROLES } from "./kvgs.js";

export const KVGS_POLL_DELAY_MS = 30_000;
export const KVGS_MAX_POLLS = 40;

/** Job kvgs-poll chỉ còn hỏi danh sách container (giữ trường `kind` để jobId/payload ổn định). */
export const KvgsKindSchema = z.enum(["CONT_LIST"]);
export type KvgsPollKind = z.infer<typeof KvgsKindSchema>;
/** Bản ghi qua KVGS: danh sách container hoặc bảng kê. */
export type KvgsTargetKind = "CONT_LIST" | "KVGS";
/** `n`: lần hỏi thứ n (1-based). `manual`: một lượt do người dùng bấm – không xếp lượt kế, không đổi sang NO_RESPONSE. */
export type KvgsPollInput = { orgId: string; userId: string; kind: KvgsPollKind; id: string; n: number; manual?: boolean };

type ActorCtx = { orgId: OrgId; userId: UserId };
export const isDomainError = (e: unknown): e is DomainError => typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
export const fmtErrors = (errors: GatewayError[]) => errors.map((e) => `${e.code}${e.field ? ` (${e.field})` : ""}: ${e.message}${e.solution ? ` → ${e.solution}` : ""}`).join("; ");
export const LABEL: Record<KvgsTargetKind, string> = { CONT_LIST: "danh sách container", KVGS: "bảng kê KVGS" };

type Target = ContainerListRecord | KvgsSheetRecord;
export const loadTarget = (deps: CustomsDeps, ctx: ActorCtx, kind: KvgsTargetKind, id: string): Promise<Target | null> =>
  deps.uow.asOrg<Target | null>(ctx, (r) => (kind === "CONT_LIST" ? r.containerLists.get(ctx.orgId, id) : r.kvgs.get(ctx.orgId, id)));

type Patch = { status: Target["status"]; errors?: GatewayError[] | null; receiptNo?: string | null; receiptDate?: string | null; sheet?: KvgsSheetRecord["sheet"]; raw?: unknown; fetchedAt?: Date | null; refId?: string | null };
/** Ghi `patch` vào bản ghi (danh sách container không có sheet/raw/fetchedAt). */
export async function patchTarget(r: CustomsRepos, orgId: string, kind: KvgsTargetKind, id: string, patch: Patch, at: Date): Promise<void> {
  if (kind === "KVGS") return r.kvgs.update(orgId, id, { ...patch, updatedAt: at });
  const { sheet: _s, raw: _r, fetchedAt: _f, ...list } = patch;
  return r.containerLists.update(orgId, id, { ...list, updatedAt: at });
}

export async function pollKvgs(deps: CustomsDeps, input: KvgsPollInput): Promise<Result<{ again: boolean }>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const now = () => deps.clock.now();
  const target = await loadTarget(deps, ctx, input.kind, input.id);
  if (!target) return err(domainError("NOT_FOUND", `Không tìm thấy ${LABEL[input.kind]}`));
  // Chỉ bản đang chờ phản hồi (đã xong / nháp → không hỏi nữa); chưa có REF_ID thì chưa gửi xong.
  if ((target.status !== "SENDING" && target.status !== "NO_RESPONSE") || !target.refId) return ok({ again: false });
  const refId = target.refId;
  const { dossierId, branch } = target;
  /** Ghi kết quả vào bản ghi + một thông điệp IN (một giao dịch), rồi báo giao diện. */
  const settle = async (patch: Patch, m: Pick<MessageRow, "result" | "summary" | "payloadMasked">) => {
    await deps.uow.asOrg(ctx, async (r) => {
      await patchTarget(r, input.orgId, input.kind, input.id, patch, now());
      await r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId, branch, operation: input.kind, direction: "IN", externalRef: refId, at: now(), ...m });
    });
    await deps.dossiers.publish(input.orgId, dossierId, { type: "customs.message" });
  };
  const rejectWith = async (errors: GatewayError[], extra: Partial<Patch> = {}) => {
    await settle({ status: "REJECTED", errors, ...extra }, { result: "ERROR", summary: `${LABEL[input.kind]}: ${fmtErrors(errors)}`, payloadMasked: { refId, errorList: errors } });
    return ok({ again: false });
  };

  const built = await loadRefRequests(deps, ctx, dossierId, branch);
  if (!built.ok) return rejectWith([{ code: built.error.code, message: built.error.message ?? built.error.code }]);
  let res: Awaited<ReturnType<CustomsDeps["gateway"]["containerListResult"]>>;
  try {
    res = await deps.gateway.containerListResult(input.orgId, { ...built.value.head, refId });
  } catch (e) {
    if (!isDomainError(e)) throw e; // lỗi tạm (mạng/5xx): BullMQ retry
    return rejectWith([{ code: e.code, message: e.message ?? e.code }]);
  }
  await meterSafely(deps.usage, { orgId: input.orgId, dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: "V5ContainerRes", quantity: 1, ...(input.manual ? {} : { dedupeKey: `kvgs-poll:${input.kind}:${input.id}:${input.n}` }), meta: { refId, attempt: input.n, ...(input.manual ? { manual: true } : {}) } });

  if (res.state === "PENDING") {
    if (input.manual) return ok({ again: false });
    if (input.n >= KVGS_MAX_POLLS) {
      await settle({ status: "NO_RESPONSE" }, { result: "ERROR", summary: `Hải quan chưa phản hồi ${LABEL[input.kind]} sau ${input.n} lần hỏi – bấm Lấy phản hồi để hỏi lại`, payloadMasked: { refId, polls: input.n } });
      return ok({ again: false });
    }
    await deps.queue.enqueue("kvgs-poll", { ...input, n: input.n + 1 }, { jobId: `kvgs-poll:${input.kind}:${input.id}:${input.n + 1}`, delayMs: KVGS_POLL_DELAY_MS });
    return ok({ again: true });
  }

  if (res.state === "REJECTED") return rejectWith(res.errors?.length ? res.errors : [{ code: "E-REJECTED", message: `Hải quan từ chối ${LABEL[input.kind]}` }]);
  const receipt = { receiptNo: res.receiptNo ?? null, receiptDate: res.receiptDate ?? null };
  const summary = receipt.receiptNo ? `Hải quan chấp nhận ${LABEL[input.kind]} – số tiếp nhận ${receipt.receiptNo}` : `Hải quan chấp nhận ${LABEL[input.kind]}`;
  await settle({ status: "ACCEPTED", errors: null, ...receipt }, { result: "OK", summary, payloadMasked: { nghiepVu: input.kind, soTiepNhan: receipt.receiptNo, ngayTiepNhan: receipt.receiptDate } });
  return ok({ again: false });
}

/**
 * Route "Lấy phản hồi" của danh sách container: bản SENDING / NO_RESPONSE mới nhất của (hồ sơ, nhánh) → hỏi một lượt (không xếp lượt kế, không đếm lần).
 * Không có bản phù hợp → INVALID_STATE. (KVGS không có bước hỏi lại – lấy bảng kê là một lời gọi đồng bộ.)
 */
export async function pollKvgsNow(deps: CustomsDeps, ctx: Ctx, dossierId: string, branch: number): Promise<Result<{ again: boolean }>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const latest = await deps.uow.asOrg(ctx, (r) => r.containerLists.latest(ctx.orgId, dossierId, branch));
  if (!latest || (latest.status !== "SENDING" && latest.status !== "NO_RESPONSE") || !latest.refId) return err(domainError("INVALID_STATE", `Không có ${LABEL.CONT_LIST} đang chờ phản hồi`));
  return pollKvgs(deps, { orgId: ctx.orgId, userId: ctx.userId, kind: "CONT_LIST", id: latest.id, n: 1, manual: true });
}

/** Hết số lần thử của job kvgs-poll (lỗi tạm kéo dài): để NO_RESPONSE – người khai bấm Lấy phản hồi để hỏi lại. */
export async function markKvgsPollFailed(deps: CustomsDeps, input: { orgId: string; kind: KvgsPollKind; id: string; reason: string }): Promise<void> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId("") };
  const target = await loadTarget(deps, ctx, input.kind, input.id);
  if (!target || target.status !== "SENDING") return;
  const now = deps.clock.now();
  await deps.uow.asOrg(ctx, async (r) => {
    await patchTarget(r, input.orgId, input.kind, input.id, { status: "NO_RESPONSE" }, now);
    await r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: target.dossierId, branch: target.branch, operation: input.kind, direction: "IN", result: "ERROR", summary: `Không hỏi được ${LABEL[input.kind]}: ${input.reason} – bấm Lấy phản hồi`, payloadMasked: { error: input.reason }, externalRef: target.refId, at: now });
  });
  await deps.dossiers.publish(input.orgId, target.dossierId, { type: "customs.message" });
}
