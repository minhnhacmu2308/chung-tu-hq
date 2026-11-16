import { notificationCursor, parseNotificationCursor, type NotificationListFilter, type NotificationPage } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import type { IdentityDeps, NotificationRow } from "./ports.js";

const toDto = (n: NotificationRow) => ({
  id: n.id,
  title: n.title,
  body: n.body,
  at: n.createdAt.toISOString(),
  read: n.readAt !== null,
  category: n.category,
  ...(n.href ? { href: n.href } : {}),
});

/** Một trang thông báo của chính người dùng (mới nhất trước) + tổng chưa đọc. Lọc và cắt trang ở SQL (keyset). */
export async function listNotifications(deps: IdentityDeps, ctx: Ctx, f: NotificationListFilter): Promise<Result<NotificationPage>> {
  const before = f.cursor ? parseNotificationCursor(f.cursor) : undefined;
  const { rows, unreadCount } = await deps.uow.asOrg(ctx, async (r) => ({
    rows: await r.notifications.page(ctx.orgId, ctx.userId, {
      limit: f.limit + 1,
      unreadOnly: f.status === "unread",
      ...(before ? { before: { at: new Date(before.at), id: before.id } } : {}),
      ...(f.category ? { category: f.category } : {}),
      ...(f.q ? { q: f.q } : {}),
    }),
    unreadCount: await r.notifications.countUnread(ctx.orgId, ctx.userId),
  }));
  const items = rows.slice(0, f.limit).map(toDto);
  const last = items.at(-1);
  return ok({ items, nextCursor: rows.length > f.limit && last ? notificationCursor(last) : null, unreadCount });
}
