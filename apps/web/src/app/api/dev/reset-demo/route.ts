// Chỉ dev/test: nạp lại dữ liệu mẫu (idempotent). Production hoặc APP_URL không phải localhost → 404; cần phiên OWNER/ADMIN.
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { HttpError, route } from "@/lib/server/route";

export const POST = route(async () => {
  const c = getContainer();
  if (c.env.NODE_ENV === "production" || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(c.env.APP_URL)) throw new HttpError(404, "NOT_FOUND", "Không có");
  const { ctx } = await requireSession();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Chỉ Chủ sở hữu/Quản trị");
  await c.resetDemo();
  return { ok: true };
});
