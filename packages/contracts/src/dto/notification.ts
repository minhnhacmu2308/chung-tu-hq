import { z } from "zod";
import { IsoDateTimeSchema } from "../common.js";

/**
 * Nhóm thông báo để lọc (không tự do): SYSTEM – thông báo hệ thống của đội vận hành; CUSTOMS – truyền / kết quả Hải quan,
 * duyệt tờ khai để truyền (liên kết tới bước Truyền của hồ sơ); DOSSIER – việc khác của hồ sơ (đọc chứng từ, AI Agent, chờ duyệt);
 * OTHER – còn lại (tài khoản, chứng thư số…).
 */
export const NOTIFICATION_CATEGORIES = ["DOSSIER", "CUSTOMS", "SYSTEM", "OTHER"] as const;
export const NotificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

/**
 * Suy nhóm từ chính dòng thông báo – nguồn DUY NHẤT: kho ghi vào cột `notifications.category` lúc tạo, mock dùng lại.
 * Backfill SQL của migration 0046 viết lại đúng các luật này.
 */
export function notificationCategory(n: { href?: string | null; announcementId?: string | null }): NotificationCategory {
  if (n.announcementId) return "SYSTEM";
  const href = n.href ?? "";
  if (!href.startsWith("/dossiers/")) return "OTHER";
  return /[?&]step=submit(&|#|$)/.test(href) ? "CUSTOMS" : "DOSSIER";
}

export const NotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  at: IsoDateTimeSchema,
  read: z.boolean(),
  href: z.string().optional(),
  category: NotificationCategorySchema,
});
export type Notification = z.infer<typeof NotificationSchema>;

/** Con trỏ trang kế (keyset trên (thời điểm tạo, id) giảm dần): `<ISO UTC>|<id>`. */
const CURSOR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z\|[A-Za-z0-9_-]{1,64}$/;
export const notificationCursor = (n: { at: string; id: string }) => `${n.at}|${n.id}`;
export function parseNotificationCursor(cursor: string): { at: string; id: string } {
  const i = cursor.indexOf("|");
  return { at: cursor.slice(0, i), id: cursor.slice(i + 1) };
}

export const NOTIFICATION_PAGE_MAX = 50;

/** Query của GET /api/notifications. */
export const NotificationListQuerySchema = z.object({
  cursor: z.string().regex(CURSOR_RE).optional(),
  limit: z.coerce.number().int().min(1).max(NOTIFICATION_PAGE_MAX).default(20),
  status: z.enum(["all", "unread"]).default("all"),
  category: NotificationCategorySchema.optional(),
  q: z
    .string()
    .trim()
    .max(100)
    .transform((s) => s || undefined)
    .optional(),
});
export type NotificationListQuery = z.input<typeof NotificationListQuerySchema>;
export type NotificationListFilter = z.output<typeof NotificationListQuerySchema>;

export const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  nextCursor: z.string().nullable(),
  /** Tổng số chưa đọc của người dùng (không theo bộ lọc) – cho huy hiệu chuông và tab "Chưa đọc". */
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationPage = z.infer<typeof NotificationPageSchema>;

/** PATCH /api/notifications/:id */
export const NotificationReadInputSchema = z.object({ read: z.boolean() });

/**
 * Sự kiện đẩy realtime khi có thông báo mới (ADR 0017): Redis pub/sub → SSE GET /api/notifications/stream → trình duyệt.
 * Chỉ các trường để hiện toast / thông báo máy tính – không bí mật. `orgId`/`userId` để server lọc đúng người nhận.
 */
export const NotificationEventSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  userId: z.string(),
  category: NotificationCategorySchema,
  title: z.string(),
  body: z.string(),
  href: z.string().nullable(),
  at: IsoDateTimeSchema,
});
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;

/** Hàm nhận của luồng thông báo phía trình duyệt (mock và http cùng chữ ký). `onOpen` = đã nối (xóa đếm lỗi); `onError(fatal)` – fatal: trình duyệt đã bỏ hẳn (vd 401), không tự nối lại. */
export type NotificationStreamHandlers = { onEvent(e: NotificationEvent): void; onOpen(): void; onError(fatal: boolean): void };
