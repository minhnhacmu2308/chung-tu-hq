import { describe, expect, it, vi } from "vitest";
import type { NotificationEvent } from "@kb/contracts";
import type { NotificationPublisher } from "../../../shared/notifier.js";
import { notificationEventFor } from "../../../shared/notifier.js";
import type { Logger } from "../../../shared/log.js";
import { InMemoryIdentityUow } from "../application/test/in-memory-uow.js";
import { createNotifier } from "./notifier.js";

const clock = { now: () => new Date("2026-11-16T03:00:00.000Z") };
const silent = (): Logger => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => silent() });

function setup(publisher: NotificationPublisher, log = silent()) {
  const uow = new InMemoryIdentityUow();
  const notifier = createNotifier({ uow, clock, dossierOwner: async () => "usr_owner", publisher, log });
  return { uow, notifier, log };
}

describe("createNotifier – đẩy realtime", () => {
  it("ghi thông báo rồi đẩy đúng một sự kiện cho mỗi người nhận, kèm nhóm suy từ href", async () => {
    const sent: NotificationEvent[] = [];
    const { uow, notifier } = setup({ publish: async (e) => void sent.push(e) });
    await notifier.notify("org_a", { userIds: ["usr_1"], dossierOwnerOf: "dos_1" }, { title: "Đã phân luồng", body: "Luồng xanh", href: "/dossiers/dos_1?step=submit" });
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(uow.data.notifications.map((n) => n.userId).sort()).toEqual(["usr_1", "usr_owner"]);
    expect(sent[0]).toEqual({ id: uow.data.notifications[0]!.id, orgId: "org_a", userId: "usr_1", category: "CUSTOMS", title: "Đã phân luồng", body: "Luồng xanh", href: "/dossiers/dos_1?step=submit", at: "2026-11-16T03:00:00.000Z" });
  });

  it("đẩy lỗi (Redis mất kết nối) không làm hỏng việc ghi – chỉ ghi log", async () => {
    const log = silent();
    const { uow, notifier } = setup({ publish: async () => Promise.reject(new Error("redis down")) }, log);
    await expect(notifier.notify("org_a", { userIds: ["usr_1"] }, { title: "T", body: "B" })).resolves.toBeUndefined();
    expect(uow.data.notifications).toHaveLength(1);
    await vi.waitFor(() => expect(log.warn).toHaveBeenCalledWith("không đẩy được thông báo realtime", expect.objectContaining({ orgId: "org_a" })));
  });

  it("publisher ném đồng bộ cũng không làm hỏng việc ghi", async () => {
    const { uow, notifier } = setup({
      publish: () => {
        throw new Error("boom");
      },
    });
    await notifier.notify("org_a", { userIds: ["usr_1"] }, { title: "T", body: "B" });
    expect(uow.data.notifications).toHaveLength(1);
  });

  it("ghi lỗi thì không đẩy gì", async () => {
    const publish = vi.fn(async () => {});
    const { uow, notifier } = setup({ publish });
    vi.spyOn(uow, "asOrg").mockRejectedValueOnce(new Error("db down"));
    await expect(notifier.notify("org_a", { userIds: ["usr_1"] }, { title: "T", body: "B" })).rejects.toThrow("db down");
    await new Promise((r) => setTimeout(r, 0));
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("notificationEventFor – lọc kênh cho một phiên", () => {
  const ev: NotificationEvent = { id: "ntf_1", orgId: "org_a", userId: "usr_1", category: "OTHER", title: "T", body: "B", href: null, at: "2026-11-16T03:00:00.000Z" };
  const me = { orgId: "org_a", userId: "usr_1" };
  it("chỉ trả sự kiện của chính người dùng trong chính doanh nghiệp", () => {
    expect(notificationEventFor(me, JSON.stringify(ev))).toEqual(ev);
    expect(notificationEventFor(me, JSON.stringify({ ...ev, userId: "usr_2" }))).toBeNull();
    // Cùng userId nhưng org khác (người dùng thuộc nhiều doanh nghiệp, phiên đang mở org_a) → không lộ sang.
    expect(notificationEventFor(me, JSON.stringify({ ...ev, orgId: "org_b" }))).toBeNull();
  });
  it("message hỏng hoặc sai schema → null", () => {
    expect(notificationEventFor(me, "not json")).toBeNull();
    expect(notificationEventFor(me, JSON.stringify({ ...ev, category: "X" }))).toBeNull();
    expect(notificationEventFor(me, JSON.stringify({ orgId: "org_a", userId: "usr_1" }))).toBeNull();
  });
});
