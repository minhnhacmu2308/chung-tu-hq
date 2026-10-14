import type { Redis } from "ioredis";
import { dossierChannel, type ProgressEvent, type ProgressPublisher } from "../application/ports.js";

/** Đẩy sự kiện tiến trình qua Redis pub/sub; route SSE của web subscribe theo channel. */
export class RedisProgressPublisher implements ProgressPublisher {
  constructor(private redis: Redis) {}
  async publish(orgId: string, dossierId: string, event: ProgressEvent) {
    await this.redis.publish(dossierChannel(orgId, dossierId), JSON.stringify({ ...event, at: new Date().toISOString() }));
  }
}
