import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { CustomsDeps } from "./customs-ports.js";

/** Dòng outbox PENDING chưa có lần xử lý nào quá lâu (mặc định 10 phút) coi như job customs-send đã mất. */
export const STUCK_OUTBOX_MS = 10 * 60_000;

/**
 * Job quét định kỳ (ADR 0005 – outbox): ghi outbox và đẩy job không cùng transaction → job có thể mất, tờ khai "đã truyền" mà không
 * bao giờ gửi. Đẩy lại job với jobId chuẩn `customs-send:<id>` (trùng là idempotent, không tạo lần gửi thứ hai).
 */
export async function requeueStuckOutbox(deps: CustomsDeps, input: { orgId: string; now?: Date; olderThanMs?: number }): Promise<{ requeued: string[] }> {
  const now = input.now ?? deps.clock.now();
  const before = new Date(now.getTime() - (input.olderThanMs ?? STUCK_OUTBOX_MS));
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId("") };
  const stuck = await deps.uow.asOrg(ctx, (r) => r.outbox.listUnsentBefore(input.orgId, before));
  for (const row of stuck) await deps.queue.enqueue("customs-send", { orgId: input.orgId, userId: "", outboxId: row.id }, { jobId: `customs-send:${row.id}` });
  return { requeued: stuck.map((r) => r.id) };
}
