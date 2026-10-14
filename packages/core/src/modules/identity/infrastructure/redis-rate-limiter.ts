import type { Redis } from "ioredis";
import type { RateLimiter } from "../application/ports.js";

/** Cửa sổ cố định: INCR + EXPIRE lần đầu. */
export class RedisRateLimiter implements RateLimiter {
  constructor(private redis: Redis) {}
  async hit(key: string, limit: number, windowSec: number) {
    const k = `rl:${key}`;
    const count = await this.redis.incr(k);
    if (count === 1) await this.redis.expire(k, windowSec);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
  async reset(key: string) {
    await this.redis.del(`rl:${key}`);
  }
}
