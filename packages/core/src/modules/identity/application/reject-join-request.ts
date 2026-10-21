import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canManageOrg } from "../domain/role-rules.js";
import { joinRejectedMail } from "./_mail-templates.js";
import type { IdentityDeps } from "./ports.js";

/**
 * Từ chối yêu cầu tham gia (chỉ OWNER/ADMIN, yêu cầu phải đang PENDING) → REJECTED; báo người xin bằng email (kèm lý do nếu có).
 * Không tạo thông báo trong ứng dụng: người xin chưa là thành viên nên không có hộp thông báo nào của doanh nghiệp này để xem.
 */
export async function rejectJoinRequest(deps: IdentityDeps, ctx: Ctx, requestId: string, input: { reason?: string | undefined }): Promise<Result<{ ok: true }>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const jr = await r.joinRequests.findById(requestId);
    if (!jr || jr.orgId !== ctx.orgId || jr.status !== "PENDING") return err(domainError("NOT_FOUND", "Không tìm thấy yêu cầu đang chờ"));
    // Đọc email người xin TRƯỚC khi đổi trạng thái: RLS users chỉ cho org xem người có yêu cầu đang PENDING.
    const [user, org] = await Promise.all([r.users.findById(jr.userId), r.orgs.findById(ctx.orgId)]);
    await r.joinRequests.decide(jr.id, "REJECTED", ctx.userId, now);
    return ok({ email: user?.email ?? null, orgName: org?.name ?? "doanh nghiệp" });
  });
  if (!res.ok) return res;
  if (res.value.email) await deps.mailer.send({ to: res.value.email, ...joinRejectedMail(res.value.orgName, input.reason) });
  return ok({ ok: true as const });
}
