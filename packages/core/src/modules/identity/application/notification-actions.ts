import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { IdentityDeps } from "./ports.js";

const notFound = () => err(domainError("NOT_FOUND", "Không tìm thấy thông báo"));

/** Đánh dấu một thông báo của mình đã đọc / chưa đọc. */
export async function setNotificationRead(deps: IdentityDeps, ctx: Ctx, id: string, read: boolean): Promise<Result<void>> {
  const found = await deps.uow.asOrg(ctx, (r) => r.notifications.setRead(ctx.orgId, ctx.userId, id, read ? deps.clock.now() : null));
  return found ? ok(undefined) : notFound();
}

/** Xóa hẳn một thông báo của mình (thông báo chỉ là bản sao gửi người nhận – không có lịch sử cần giữ). */
export async function deleteNotification(deps: IdentityDeps, ctx: Ctx, id: string): Promise<Result<void>> {
  const found = await deps.uow.asOrg(ctx, (r) => r.notifications.delete(ctx.orgId, ctx.userId, id));
  return found ? ok(undefined) : notFound();
}
