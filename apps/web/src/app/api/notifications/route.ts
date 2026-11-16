import { NotificationListQuerySchema } from "@kb/contracts";
import { listNotifications } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseQuery, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** ?cursor=&limit=20&status=all|unread&category=&q= → { items, nextCursor, unreadCount } */
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await listNotifications(getContainer().identity, ctx, parseQuery(req, NotificationListQuerySchema)));
});
