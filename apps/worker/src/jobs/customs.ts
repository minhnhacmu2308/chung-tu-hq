import { KvgsKindSchema, notifyIdentifierBatchDone, pollIdentifier, pollKvgs, pollStatus, processIdentifier, processOutbox, type CustomsDeps } from "@kb/core/modules/integration";
import { createLogger } from "@kb/core/shared";
import { z } from "zod";
import { parsePayload } from "./_payload.js";

const log = createLogger({ name: "worker" });

export const CustomsSendPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), outboxId: z.string().min(1) });
/** `branch`: tờ khai nhánh (lô > 50 dòng); job tạo trước khi tách tờ khai không có → nhánh 1. */
export const CustomsPollPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), dossierId: z.string().min(1), attempt: z.number().int().positive(), branch: z.number().int().positive().optional() });

/** Gửi một dòng outbox tới Hải quan (IDA/IDC/HYS…). Lỗi tạm ném ra để BullMQ retry; lỗi FPT ghi nhật ký, không retry. */
export async function customsSendJob(deps: CustomsDeps, raw: unknown) {
  const p = parsePayload(CustomsSendPayload, raw, "customs-send");
  const r = await processOutbox(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "customs-send", outboxId: p.outboxId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? `${r.value.status}${r.value.next ? ` → ${r.value.next}` : ""}` : r.error.code;
}

/** Hỏi trạng thái tờ khai tới khi thông quan/từ chối. */
export async function customsPollJob(deps: CustomsDeps, raw: unknown) {
  const p = parsePayload(CustomsPollPayload, raw, "customs-poll");
  const r = await pollStatus(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "customs-poll", dossierId: p.dossierId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? (r.value.done ? (r.value.cleared ? "cleared" : "done") : "again") : r.error.code;
}

/** Payload job kvgs-poll: `kind` CONT_LIST (danh sách container – KVGS lấy bảng kê đồng bộ, không poll), `id` = bản ghi, `n` = lần hỏi thứ n. */
export const KvgsPollPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), kind: KvgsKindSchema, id: z.string().min(1), n: z.number().int().positive() });

/** Hỏi kết quả khai danh sách container (V5ContainerRes) theo REF_ID. Lỗi tạm ném ra để BullMQ retry. */
export async function kvgsPollJob(deps: CustomsDeps, raw: unknown) {
  const p = parsePayload(KvgsPollPayload, raw, "kvgs-poll");
  const r = await pollKvgs(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "kvgs-poll", kind: p.kind, id: p.id, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? (r.value.again ? "again" : "done") : r.error.code;
}

/** Payload job identifier-send / identifier-poll: `id` = bản ghi khai báo định danh, `attempt` = lần gửi tạo job (job xếp trước khi có trường này: vắng), `n` = lần hỏi thứ n. */
export const IdentifierSendPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), id: z.string().min(1), attempt: z.number().int().positive().optional() });
export const IdentifierPollPayload = IdentifierSendPayload.extend({ n: z.number().int().positive() });

/** Gửi khai báo định danh (V5IdentifierReq). Lỗi tạm ném ra để BullMQ retry; lỗi Hải quan / chưa cấu hình ghi vào bản ghi, không retry. */
export async function identifierSendJob(deps: CustomsDeps, raw: unknown) {
  const p = parsePayload(IdentifierSendPayload, raw, "identifier-send");
  const r = await processIdentifier(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "identifier-send", id: p.id, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? r.value.status : r.error.code;
}

/** Hỏi kết quả khai báo định danh (V5IdentifierRes) theo REF_ID. */
export async function identifierPollJob(deps: CustomsDeps, raw: unknown) {
  const p = parsePayload(IdentifierPollPayload, raw, "identifier-poll");
  const r = await pollIdentifier(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "identifier-poll", id: p.id, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? (r.value.again ? "again" : "done") : r.error.code;
}

/** Payload job identifier-batch-done: lô số định danh vừa xong hết. */
export const IdentifierBatchDonePayload = z.object({ orgId: z.string().min(1), batchId: z.string().min(1) });

/** Báo người xin lô số định danh khi lô xong (jobId theo lô + attempt lớn nhất chống báo trùng). */
export async function identifierBatchDoneJob(deps: CustomsDeps, raw: unknown) {
  const p = parsePayload(IdentifierBatchDonePayload, raw, "identifier-batch-done");
  await notifyIdentifierBatchDone(deps, p);
  return "done";
}
