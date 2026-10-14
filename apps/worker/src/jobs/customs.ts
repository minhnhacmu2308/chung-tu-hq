import { pollStatus, processOutbox, type CustomsDeps } from "@kb/core/modules/integration";
import { z } from "zod";

export const CustomsSendPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), outboxId: z.string().min(1) });
export const CustomsPollPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), dossierId: z.string().min(1), attempt: z.number().int().positive() });

/** Gửi một dòng outbox tới Hải quan (IDA/IDC/HYS…). Lỗi tạm ném ra để BullMQ retry; lỗi FPT ghi nhật ký, không retry. */
export async function customsSendJob(deps: CustomsDeps, raw: unknown) {
  const p = CustomsSendPayload.parse(raw);
  const r = await processOutbox(deps, p);
  if (!r.ok) console.warn(`[customs-send] ${p.outboxId}: ${r.error.code} ${r.error.message ?? ""}`);
  return r.ok ? `${r.value.status}${r.value.next ? ` → ${r.value.next}` : ""}` : r.error.code;
}

/** Hỏi trạng thái tờ khai tới khi thông quan/từ chối. */
export async function customsPollJob(deps: CustomsDeps, raw: unknown) {
  const p = CustomsPollPayload.parse(raw);
  const r = await pollStatus(deps, p);
  if (!r.ok) console.warn(`[customs-poll] ${p.dossierId}: ${r.error.code} ${r.error.message ?? ""}`);
  return r.ok ? (r.value.done ? (r.value.cleared ? "cleared" : "done") : "again") : r.error.code;
}
