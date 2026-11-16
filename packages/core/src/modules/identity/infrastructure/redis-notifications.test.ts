import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { NOTIFICATION_CHANNEL } from "../../../shared/notifier.js";
import { createNotificationHub } from "./redis-notifications.js";

class FakeSub extends EventEmitter {
  subscribe = vi.fn(async () => 1);
}

describe("createNotificationHub", () => {
  it("một kết nối subscriber cho mọi người nghe, phát lại message của kênh, hủy đăng ký thì thôi nhận", () => {
    const sub = new FakeSub();
    const connect = vi.fn(() => sub as unknown as Redis);
    const hub = createNotificationHub(connect);
    const a = vi.fn();
    const b = vi.fn();
    const offA = hub.subscribe(a);
    hub.subscribe(b);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sub.subscribe).toHaveBeenCalledWith(NOTIFICATION_CHANNEL);
    expect(hub.size).toBe(2);
    sub.emit("message", NOTIFICATION_CHANNEL, "x");
    sub.emit("message", "org:o:dossier:d", "khác kênh");
    expect(a).toHaveBeenCalledExactlyOnceWith("x");
    expect(b).toHaveBeenCalledExactlyOnceWith("x");
    offA();
    sub.emit("message", NOTIFICATION_CHANNEL, "y");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenLastCalledWith("y");
    expect(hub.size).toBe(1);
  });

  it("một người nghe lỗi không chặn người khác; lỗi kết nối / subscribe chỉ ghi log, không ném", async () => {
    const sub = new FakeSub();
    sub.subscribe = vi.fn(async () => {
      throw new Error("redis down");
    });
    const hub = createNotificationHub(() => sub as unknown as Redis);
    const ok = vi.fn();
    hub.subscribe(() => {
      throw new Error("boom");
    });
    hub.subscribe(ok);
    expect(() => sub.emit("error", new Error("ECONNRESET"))).not.toThrow();
    sub.emit("message", NOTIFICATION_CHANNEL, "x");
    expect(ok).toHaveBeenCalledWith("x");
    await new Promise((r) => setTimeout(r, 0)); // subscribe bị từ chối đã được bắt
  });
});
