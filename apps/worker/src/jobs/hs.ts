import { HsApiError, pollHsJob, runHsReclassify, sendHsAnswer, type DeclarationDeps } from "@kb/core/modules/declaration";
import { UnrecoverableError } from "bullmq";
import { createLogger } from "@kb/core/shared";
import { z } from "zod";
import { parsePayload } from "./_payload.js";

const log = createLogger({ name: "worker" });

const Base = { orgId: z.string().min(1), userId: z.string().min(1), dossierId: z.string().min(1) };
export const HsPollPayload = z.object({ ...Base, hsJobId: z.string().min(1) });
export const HsAnswerPayload = z.object({
  ...Base, lineItemId: z.string().min(1), questionId: z.string().min(1),
  answers: z.array(z.object({ id: z.string().min(1), selected: z.array(z.string()), custom: z.string().nullable() })).min(1),
});
/** Lỗi HSCodePro không tạm thời (401 khóa sai, 404, phản hồi sai cấu trúc…) → không thử lại vô ích; handler "failed" đánh dấu dòng lỗi. */
async function noUselessRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HsApiError && !e.transient) throw new UnrecoverableError(`${e.code}: ${e.message}`);
    throw e;
  }
}

export const HsReclassifyPayload = z.object({ ...Base, lineItemId: z.string().min(1), extraDescription: z.string().optional() });

/** Hỏi trạng thái một lượt HSCodePro; còn processing thì use case tự hẹn lần sau. Lỗi tạm (5xx/429/mạng) ném ra để BullMQ retry. */
export async function hsPollJob(deps: DeclarationDeps, raw: unknown) {
  const p = parsePayload(HsPollPayload, raw, "hs-poll");
  const r = await noUselessRetry(() => pollHsJob(deps, p));
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "hs-poll", hsJobId: p.hsJobId, dossierId: p.dossierId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? (r.value.again ? "again" : "done") : r.error.code;
}

/** Gửi câu trả lời của người khai tới HSCodePro rồi poll lại. */
export async function hsAnswerJob(deps: DeclarationDeps, raw: unknown) {
  const p = parsePayload(HsAnswerPayload, raw, "hs-answer");
  const r = await noUselessRetry(() => sendHsAnswer(deps, p));
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "hs-answer", lineItemId: p.lineItemId, dossierId: p.dossierId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? "sent" : r.error.code;
}

/** Phân loại lại một dòng (lượt mới 1 dòng). */
export async function hsReclassifyJob(deps: DeclarationDeps, raw: unknown) {
  const { extraDescription, ...p } = parsePayload(HsReclassifyPayload, raw, "hs-reclassify");
  const r = await noUselessRetry(() => runHsReclassify(deps, { ...p, ...(extraDescription ? { extraDescription } : {}) }));
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "hs-reclassify", lineItemId: p.lineItemId, dossierId: p.dossierId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? (r.value.pending ? "pending" : "done") : r.error.code;
}
