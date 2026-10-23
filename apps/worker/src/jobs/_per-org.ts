import { DelayedError, type Job } from "bullmq";

/** Phần của Redis mà semaphore cần (ioredis thật hoặc giả trong test). */
export type SemaphoreRedis = { incr(key: string): Promise<number>; decr(key: string): Promise<number>; expire(key: string, seconds: number): Promise<unknown>; del(key: string): Promise<unknown> };

/** Khóa đếm tự hết hạn sau 15 phút: tiến trình chết giữa chừng không giữ chỗ mãi (job dài nhất ~10 phút). */
const SLOT_TTL_SEC = 15 * 60;
const RETRY_MS = 3_000;

/**
 * Giới hạn số job đồng thời của MỘT doanh nghiệp trên một queue (BullMQ cộng đồng không có nhóm theo khóa): đếm trong Redis,
 * đủ chỗ thì chạy, hết chỗ thì trả job về hàng đợi trễ 3–6 giây (không tính là lần thử lại) để doanh nghiệp khác được chạy.
 * Payload không có orgId → chạy thẳng.
 */
export function perOrgLimit<T>(redis: SemaphoreRedis, queue: string, maxPerOrg: number, handler: (job: Job) => Promise<T>) {
  return async (job: Job, token?: string): Promise<T> => {
    const orgId = (job.data as { orgId?: unknown } | undefined)?.orgId;
    if (typeof orgId !== "string" || !orgId) return handler(job);
    const key = `org-slots:${queue}:${orgId}`;
    const active = await redis.incr(key);
    if (active === 1) await redis.expire(key, SLOT_TTL_SEC);
    if (active > maxPerOrg) {
      await redis.decr(key);
      await job.moveToDelayed(Date.now() + RETRY_MS + Math.floor(Math.random() * RETRY_MS), token);
      throw new DelayedError();
    }
    try {
      return await handler(job);
    } finally {
      const left = await redis.decr(key);
      if (left <= 0) await redis.del(key);
    }
  };
}
