import { HsApiError, pollHsJob, runHsReclassify, sendHsAnswer, type DeclarationDeps } from "@kb/core/modules/declaration";
import { UnrecoverableError } from "bullmq";
import { z } from "zod";

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
  const p = HsPollPayload.parse(raw);
  const r = await noUselessRetry(() => pollHsJob(deps, p));
  if (!r.ok) console.warn(`[hs-poll] ${p.hsJobId}: ${r.error.code} ${r.error.message ?? ""}`);
  return r.ok ? (r.value.again ? "again" : "done") : r.error.code;
}

/** Gửi câu trả lời của người khai tới HSCodePro rồi poll lại. */
export async function hsAnswerJob(deps: DeclarationDeps, raw: unknown) {
  const p = HsAnswerPayload.parse(raw);
  const r = await noUselessRetry(() => sendHsAnswer(deps, p));
  return r.ok ? "sent" : r.error.code;
}

/** Phân loại lại một dòng (lượt mới 1 dòng). */
export async function hsReclassifyJob(deps: DeclarationDeps, raw: unknown) {
  const { extraDescription, ...p } = HsReclassifyPayload.parse(raw);
  const r = await noUselessRetry(() => runHsReclassify(deps, { ...p, ...(extraDescription ? { extraDescription } : {}) }));
  return r.ok ? (r.value.pending ? "pending" : "done") : r.error.code;
}
