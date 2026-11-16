// Một thông báo của chính mình: PATCH { read } đánh dấu đã đọc / chưa đọc, DELETE xóa.
import { NotificationReadInputSchema } from "@kb/contracts";
import { deleteNotification, setNotificationRead } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { read } = await parseBody(req, NotificationReadInputSchema);
  fromResult(await setNotificationRead(getContainer().identity, ctx, params.id!, read));
  return { ok: true };
});
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  fromResult(await deleteNotification(getContainer().identity, ctx, params.id!));
  return { ok: true };
});
