import type { Clock } from "../../../shared/clock.js";
import type { RateLimiter } from "../application/ports.js";

/** Cho dev không Redis và test. */
export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private clock: Clock) {}
  async hit(key: string, limit: number, windowSec: number) {
    const now = this.clock.now().getTime();
    const cur = this.hits.get(key);
    const entry = cur && cur.resetAt > now ? cur : { count: 0, resetAt: now + windowSec * 1000 };
    entry.count += 1;
    this.hits.set(key, entry);
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
  }
}
