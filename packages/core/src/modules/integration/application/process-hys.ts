// Worker `customs-send`, nhánh HYS (K1 – tách trước bước tra customs_results; không đọc/ghi customs_results):
// outbox HYS → bộ + file (bytes từ kho) → gateway.attachDocuments → ACCEPTED (số tiếp nhận, ngày) / REJECTED / SEND_FAILED
// → lô còn sửa được và bộ khai trước tờ khai → điền cặp 1.63/2.53 qua DeclarationReader.fillAttachment.
// Idempotent: bộ đã ACCEPTED → không gửi lại; đã có kết quả điền → không điền lại (crash giữa ghi ACCEPTED và điền → lần chạy lại điền tiếp).
import { AttachmentSlotSchema, type HysFill } from "@kb/contracts";
import { z } from "zod";
import { domainError } from "../../../shared/errors.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { MAX_ATTEMPTS } from "./_outbox.js";
import type { CustomsDeps, CustomsRepos, GatewayError, HysSubmissionRow, MessageRow, OutboxRow } from "./customs-ports.js";
import { lotEditableOf } from "./hys-submissions.js";

/** payload outbox HYS (jsonb – dữ liệu từ ngoài, bất biến 9). Outbox HYS kiểu cũ (payload `files`) không có `submissionId`. */
/** `replaceSlot`: cặp 1.63/2.53 người khai chọn thay khi đã đủ 3 cặp (không có cột riêng – đi trong payload). */
export const HysOutboxPayloadSchema = z.object({ submissionId: z.string().min(1), certificateId: z.string().optional(), replaceSlot: AttachmentSlotSchema.optional() });
export const HYS_LEGACY_ERROR = "HYS kiểu cũ không còn hỗ trợ – khai bộ HYS mới";

type ActorCtx = { orgId: OrgId; userId: UserId };
type Done = Result<{ status: OutboxRow["status"]; next: null }>;
const isDomainError = (e: unknown): e is { code: string; message?: string } => typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
const fmtErrors = (errors: GatewayError[]) => errors.map((e) => `${e.code}${e.field ? ` (${e.field})` : ""}: ${e.message}${e.solution ? ` → ${e.solution}` : ""}`).join("; ");
const toReject = (errors: GatewayError[]): NonNullable<HysSubmissionRow["reject"]> => errors.map((e) => ({ code: e.code, message: e.message, ...(e.solution ? { solution: e.solution } : {}) }));

export async function processHysOutbox(deps: CustomsDeps, ctx: ActorCtx, ob: OutboxRow): Promise<Done> {
  const now = () => deps.clock.now();
  const msg = (r: CustomsRepos, m: Omit<MessageRow, "id" | "orgId" | "dossierId" | "branch" | "operation" | "at" | "externalRef">) =>
    r.messages.insert({ id: deps.idGen.next("msg"), orgId: ob.orgId, dossierId: ob.dossierId, branch: ob.branch, operation: "HYS", externalRef: null, at: now(), ...m });
  const publish = () => deps.dossiers.publish(ob.orgId, ob.dossierId, { type: "customs.message" });
  /** Outbox không gửi được và không gắn được vào bộ nào (payload cũ / bộ đã xóa). */
  const failOutbox = async (reason: string): Promise<Done> => {
    if (ob.status !== "PENDING") return ok({ status: ob.status, next: null });
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "IN", result: "ERROR", summary: reason, payloadMasked: { error: reason } });
      await r.outbox.update(ob.orgId, ob.id, { status: "FAILED", lastError: reason, updatedAt: now() });
    });
    await publish();
    return ok({ status: "FAILED", next: null });
  };

  const parsed = HysOutboxPayloadSchema.safeParse(ob.payload);
  if (!parsed.success) return failOutbox(HYS_LEGACY_ERROR);
  const id = parsed.data.submissionId;
  const loaded = await deps.uow.asOrg(ctx, async (r) => {
    const sub = await r.hys.get(ob.orgId, id);
    return sub && sub.dossierId === ob.dossierId ? { sub, files: await r.hys.files(ob.orgId, id) } : null;
  });
  if (!loaded) return failOutbox("Không tìm thấy bộ HYS (đã xóa?) – khai bộ HYS mới");
  const { sub, files } = loaded;
  const code = sub.procedureCode ?? "";
  /** Báo người phụ trách hồ sơ (bị từ chối / không gửi được) – như nghiệp vụ tờ khai bị từ chối (process-outbox). */
  const notifyOwner = async (title: string, body: string) => {
    const dossier = await deps.dossiers.get(ob.orgId, ob.dossierId);
    await deps.notify?.notify(ob.orgId, { dossierOwnerOf: ob.dossierId }, { title: `${dossier?.code ?? ob.dossierId}: ${title}`, body: body.slice(0, 300), href: `/dossiers/${ob.dossierId}?step=submit` });
  };

  // Đã ACCEPTED (job chạy lại sau crash / sau khi đã ghi kết quả): không gửi lại; điền 1.63 nếu lần trước chưa kịp.
  if (sub.status === "ACCEPTED") {
    if (ob.status === "PENDING") await deps.uow.asOrg(ctx, (r) => r.outbox.update(ob.orgId, ob.id, { status: "SENT", lastError: null, updatedAt: now() }));
    if (!sub.fill) await fillDeclaration(deps, ctx, sub, parsed.data.replaceSlot);
    await publish();
    return ok({ status: "SENT", next: null });
  }
  if (ob.status !== "PENDING") return ok({ status: ob.status, next: null });

  /** Lỗi gửi vĩnh viễn / hết lượt: bộ SEND_FAILED (lưu lý do), outbox FAILED – người khai "Gửi lại". */
  const sendFailed = async (errors: GatewayError[], summary: string): Promise<Done> => {
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "IN", result: "ERROR", summary, payloadMasked: { errorList: errors } });
      await r.outbox.update(ob.orgId, ob.id, { status: "FAILED", lastError: fmtErrors(errors), updatedAt: now() });
      await r.hys.update(ob.orgId, id, { status: "SEND_FAILED", reject: toReject(errors), updatedAt: now() });
    });
    await publish();
    await notifyOwner(`HYS ${code} không gửi được`, fmtErrors(errors));
    return ok({ status: "FAILED", next: null });
  };
  if (ob.attempts >= MAX_ATTEMPTS) {
    const reason = ob.lastError ?? "lỗi kết nối";
    return sendFailed([{ code: "E-SEND", message: reason }], `Không gửi được HYS sau ${ob.attempts} lần thử: ${reason} – bấm Gửi lại`);
  }

  // Thông điệp OUT ghi đúng một lần (job chạy lại sau crash không nhân đôi); không ghi nội dung file.
  if (ob.attempts === 0) {
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "OUT", result: "OK", summary: `Khai HYS ${code} (bộ ${sub.seq}, ${files.length} tệp)`, payloadMasked: { procedureCode: code, customsOffice: sub.customsOffice, processingUnit: sub.processingUnit, files: files.map((f) => ({ name: f.fileName, sizeBytes: f.sizeBytes })) } });
      await r.outbox.update(ob.orgId, ob.id, { attempts: 1, updatedAt: now() });
    });
  } else await deps.uow.asOrg(ctx, (r) => r.outbox.update(ob.orgId, ob.id, { attempts: ob.attempts + 1, updatedAt: now() }));

  const bytes: { name: string; bytes: Buffer }[] = [];
  for (const f of files) {
    try {
      bytes.push({ name: f.fileName, bytes: await deps.dossiers.readFile(f.storageKey) });
    } catch {
      const e = domainError("FILE_INVALID", `Không đọc được file ${f.fileName} – bỏ file khỏi bộ rồi gửi lại`);
      return sendFailed([{ code: e.code, message: e.message! }], `HYS không gửi được: ${e.message}`);
    }
  }

  let res: Awaited<ReturnType<CustomsDeps["gateway"]["attachDocuments"]>>;
  try {
    res = await deps.gateway.attachDocuments(ob.orgId, {
      dossierId: ob.dossierId, customsOffice: sub.customsOffice ?? "", processingUnit: sub.processingUnit ?? "", procedureCode: code,
      phone: sub.phone, internalRef: sub.internalRef, note: sub.note, files: bytes, ...(parsed.data.certificateId ? { certificateId: parsed.data.certificateId } : {}),
    }, ob.idempotencyKey);
  } catch (e) {
    if (isDomainError(e)) {
      // Lỗi vĩnh viễn (chưa cấu hình, chưa hỗ trợ): không retry.
      const errors = [{ code: e.code, message: e.message ?? e.code }];
      return sendFailed(errors, `HYS không gửi được: ${fmtErrors(errors)}`);
    }
    // Lỗi tạm (mạng/5xx): ghi nhật ký, giữ PENDING, ném để BullMQ retry.
    const message = e instanceof Error ? e.message : String(e);
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "IN", result: "ERROR", summary: `Lỗi tạm thời khi gửi HYS: ${message} – sẽ thử lại`, payloadMasked: { error: message } });
      await r.outbox.update(ob.orgId, ob.id, { lastError: message, nextAttemptAt: new Date(now().getTime() + 30_000), updatedAt: now() });
    });
    throw e;
  }
  // Bộ không qua được kiểm schema tại chỗ (E-SCHEMA – chưa gọi cổng): lỗi dữ liệu của bộ, không phải Hải quan từ chối, không tính chi phí.
  if (res.errors?.length && res.errors.every((e) => e.code === "E-SCHEMA")) {
    return sendFailed(res.errors, `HYS ${code} chưa gửi Hải quan – dữ liệu bộ không hợp lệ: ${fmtErrors(res.errors)}`);
  }
  // Chi phí Customs Hub: cổng đã xử lý thông điệp (kể cả từ chối); khóa = idempotencyKey (chạy lại không tính thêm).
  await meterSafely(deps.usage, { orgId: ob.orgId, dossierId: ob.dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", operation: "HYS", quantity: 1, dedupeKey: `customs:${ob.idempotencyKey}`, meta: { outboxId: ob.id } });

  if (res.errors?.length) {
    // Hải quan từ chối: thông điệp đã được xử lý → outbox SENT; bộ REJECTED, sửa rồi gửi lại (khóa mới).
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "IN", result: "ERROR", summary: `HYS ${code} bị từ chối: ${fmtErrors(res.errors!)}`, payloadMasked: { errorList: res.errors } });
      await r.outbox.update(ob.orgId, ob.id, { status: "SENT", lastError: fmtErrors(res.errors!), updatedAt: now() });
      await r.hys.update(ob.orgId, id, { status: "REJECTED", reject: toReject(res.errors!), updatedAt: now() });
    });
    await publish();
    await notifyOwner(`HYS ${code} bị từ chối`, fmtErrors(res.errors));
    return ok({ status: "SENT", next: null });
  }

  const receiptNo = res.receiptNo ?? null;
  const accepted: HysSubmissionRow = { ...sub, status: "ACCEPTED", receiptNo, registeredOn: res.registeredOn ?? null, reject: null };
  await deps.uow.asOrg(ctx, async (r) => {
    const summary = receiptNo ? `Đã tiếp nhận HYS ${code} – số tiếp nhận ${receiptNo}` : `Đã tiếp nhận HYS ${code} – chưa nhận được số tiếp nhận, nhập tay vào 1.63`;
    await msg(r, { direction: "IN", result: "OK", summary, payloadMasked: { nghiepVu: "HYS", maThuTuc: code, soTiepNhan: receiptNo, ngayTiepNhan: accepted.registeredOn } });
    await r.outbox.update(ob.orgId, ob.id, { status: "SENT", lastError: null, updatedAt: now() });
    await r.hys.update(ob.orgId, id, { status: "ACCEPTED", receiptNo, registeredOn: accepted.registeredOn, reject: null, updatedAt: now() });
  });
  await fillDeclaration(deps, ctx, accepted, parsed.data.replaceSlot);
  await publish();
  return ok({ status: "SENT", next: null });
}

/**
 * Điền cặp 1.63/2.53 (spec §2.3): có số ∧ bộ khai trước tờ khai ∧ lô còn sửa được (tính lại lúc này) → fillAttachment (đủ 3 cặp → thay cặp replaceSlot);
 * không có số → NO_RECEIPT; ngược lại → LOCKED (không sửa tờ khai – tránh đổi nội dung đã gửi). Ghi kết quả vào bộ.
 */
async function fillDeclaration(deps: CustomsDeps, ctx: ActorCtx, sub: HysSubmissionRow, replaceSlot: 1 | 2 | 3 | undefined): Promise<void> {
  let fill: HysFill;
  if (!sub.receiptNo) fill = { outcome: "NO_RECEIPT" };
  else {
    const snap = await deps.declarations.get(ctx.orgId, sub.dossierId);
    const { results, outbox } = await deps.uow.asOrg(ctx, async (r) => ({ results: await r.results.listForDossier(ctx.orgId, sub.dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, sub.dossierId) }));
    if (sub.purpose === "PRE_DECLARATION" && lotEditableOf(snap, results, outbox)) {
      const res = await deps.declarations.fillAttachment(ctx, sub.dossierId, { procedureCode: sub.procedureCode ?? "", receiptNo: sub.receiptNo, note: `HYS ${sub.seq} – ${sub.receiptNo}`, ...(replaceSlot ? { replaceSlot } : {}) });
      fill = { outcome: res.outcome, ...(res.slot ? { slot: res.slot } : {}), ...(res.replaced ? { replaced: res.replaced } : {}), afterApproval: res.afterApproval };
    } else fill = { outcome: "LOCKED" };
  }
  await deps.uow.asOrg(ctx, (r) => r.hys.update(ctx.orgId, sub.id, { fill, updatedAt: deps.clock.now() }));
}
