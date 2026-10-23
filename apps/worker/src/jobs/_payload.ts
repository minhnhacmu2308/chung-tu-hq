import { UnrecoverableError } from "bullmq";
import type { ZodType } from "zod";

/**
 * Parse payload job bằng Zod. Payload sai hình dạng là lỗi lập trình (producer gửi sai), thử lại 5 lần cũng không khác →
 * ném UnrecoverableError để BullMQ đưa thẳng vào failed (handler "failed" vẫn chạy để gỡ kẹt bản ghi liên quan).
 */
export function parsePayload<T>(schema: ZodType<T>, raw: unknown, queue: string): T {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  const detail = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new UnrecoverableError(`[${queue}] payload không hợp lệ – ${detail}`);
}
