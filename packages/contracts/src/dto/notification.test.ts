import { describe, expect, it } from "vitest";
import { NotificationListQuerySchema, notificationCategory, notificationCursor, parseNotificationCursor } from "./notification.js";

describe("notificationCategory", () => {
  it("thông báo hệ thống theo announcementId, bất kể href", () => {
    expect(notificationCategory({ announcementId: "ann_1", href: "/dossiers/dos_1?step=submit" })).toBe("SYSTEM");
  });
  it("bước Truyền của hồ sơ → CUSTOMS; bước khác của hồ sơ → DOSSIER", () => {
    expect(notificationCategory({ href: "/dossiers/dos_1?step=submit" })).toBe("CUSTOMS");
    expect(notificationCategory({ href: "/dossiers/dos_1?x=1&step=submit#kvgs-1" })).toBe("CUSTOMS");
    expect(notificationCategory({ href: "/dossiers/dos_1?step=submitted" })).toBe("DOSSIER");
    expect(notificationCategory({ href: "/dossiers/dos_1?step=ocr" })).toBe("DOSSIER");
    expect(notificationCategory({ href: "/dossiers/dos_1" })).toBe("DOSSIER");
  });
  it("không liên kết hoặc liên kết khác → OTHER", () => {
    expect(notificationCategory({ href: null })).toBe("OTHER");
    expect(notificationCategory({ href: "/settings?tab=certificates" })).toBe("OTHER");
    expect(notificationCategory({ href: "/dossiers" })).toBe("OTHER");
  });
});

describe("NotificationListQuerySchema", () => {
  it("mặc định limit 20, status all; q rỗng bỏ đi; limit lấy từ chuỗi", () => {
    expect(NotificationListQuerySchema.parse({})).toEqual({ limit: 20, status: "all" });
    expect(NotificationListQuerySchema.parse({ limit: "5", q: "  ", status: "unread", category: "CUSTOMS" })).toEqual({ limit: 5, status: "unread", category: "CUSTOMS" });
  });
  it("chặn limit ngoài 1..50, nhóm lạ, con trỏ sai dạng", () => {
    expect(NotificationListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(NotificationListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(NotificationListQuerySchema.safeParse({ category: "FOO" }).success).toBe(false);
    expect(NotificationListQuerySchema.safeParse({ cursor: "abc" }).success).toBe(false);
    expect(NotificationListQuerySchema.safeParse({ cursor: "2026-01-01T00:00:00.000Z|x';drop" }).success).toBe(false);
  });
  it("con trỏ đi và về", () => {
    const c = notificationCursor({ at: "2026-11-16T03:04:05.678Z", id: "ntf_01ABC" });
    expect(NotificationListQuerySchema.parse({ cursor: c }).cursor).toBe(c);
    expect(parseNotificationCursor(c)).toEqual({ at: "2026-11-16T03:04:05.678Z", id: "ntf_01ABC" });
  });
});
