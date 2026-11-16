// Thông báo realtime qua Redis pub/sub (ADR 0017): worker/web PUBLISH vào một kênh; mỗi tiến trình web giữ MỘT kết nối
// SUBSCRIBE riêng và phát lại trong tiến trình cho các luồng SSE đang mở – không mở một kết nối Redis cho mỗi trình duyệt.
import type { Redis } from "ioredis";
import type { NotificationEvent } from "@kb/contracts";
import { setNotificationStreamClients } from "../../../observability/index.js";
import { NOTIFICATION_CHANNEL, type NotificationPublisher } from "../../../shared/notifier.js";
import { createLogger } from "../../../shared/log.js";

const hubLog = createLogger({ name: "notification-hub" });

export class RedisNotificationPublisher implements NotificationPublisher {
  constructor(private redis: Redis) {}
  async publish(event: NotificationEvent) {
    await this.redis.publish(NOTIFICATION_CHANNEL, JSON.stringify(event));
  }
}

export type NotificationHub = {
  /** Nhận mọi message thô của kênh (người gọi tự lọc theo phiên bằng `notificationEventFor`); trả hàm hủy. */
  subscribe(listener: (raw: string) => void): () => void;
  readonly size: number;
};

/** `connect` tạo kết nối subscriber riêng (thường `redis.duplicate()`), gọi lần đầu có người nghe; ioredis tự subscribe lại khi nối lại. */
export function createNotificationHub(connect: () => Redis): NotificationHub {
  const listeners = new Set<(raw: string) => void>();
  let sub: Redis | null = null;
  const report = () => setNotificationStreamClients(listeners.size);
  return {
    subscribe(listener) {
      if (!sub) {
        sub = connect();
        sub.on("message", (channel: string, raw: string) => {
          if (channel !== NOTIFICATION_CHANNEL) return;
          // Một luồng SSE lỗi không được chặn các luồng còn lại.
          for (const l of listeners) {
            try {
              l(raw);
            } catch (e) {
              hubLog.warn("notification listener failed", { err: String(e) });
            }
          }
        });
        // Redis rớt: ioredis tự nối lại + subscribe lại; chỉ ghi log, không để thành unhandled error / rejection.
        sub.on("error", (e: unknown) => hubLog.warn("notification subscriber error", { err: String(e) }));
        sub.subscribe(NOTIFICATION_CHANNEL).catch((e: unknown) => hubLog.warn("notification subscribe failed", { err: String(e) }));
      }
      listeners.add(listener);
      report();
      return () => {
        listeners.delete(listener);
        report();
      };
    },
    get size() {
      return listeners.size;
    },
  };
}
