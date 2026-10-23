import type { TransferOwnershipInput, TransferOwnershipResult } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canTransferOwnership } from "../domain/role-rules.js";
import { membersOf } from "./_members.js";
import { ownershipTransferredMail } from "./_mail-templates.js";
import type { IdentityDeps } from "./ports.js";

/** Số lần nhập sai mật khẩu xác nhận tối đa trong 15 phút (chống dò mật khẩu bằng phiên đã đăng nhập). */
const MAX_ATTEMPTS = 5;

/**
 * Chuyển quyền sở hữu doanh nghiệp: chỉ Chủ sở hữu hiện tại, nhập lại mật khẩu để xác nhận.
 * Trong MỘT transaction: người nhận → OWNER, chủ cũ → ADMIN (doanh nghiệp luôn có đúng một OWNER).
 * Phiên không cần làm mới: vai trò đọc lại từ membership ở mỗi request.
 */
export async function transferOwnership(deps: IdentityDeps, ctx: Ctx, targetUserId: string, input: TransferOwnershipInput): Promise<Result<TransferOwnershipResult>> {
  if (ctx.role !== "OWNER") return err(domainError("FORBIDDEN", "Chỉ Chủ sở hữu được chuyển quyền sở hữu"));
  if (targetUserId === ctx.userId) return err(domainError("FORBIDDEN", "Không thể chuyển quyền sở hữu cho chính mình"));

  const rl = await deps.rateLimiter.hit(`transfer-ownership:${ctx.userId}`, MAX_ATTEMPTS, 900);
  if (!rl.allowed) return err(domainError("RATE_LIMITED", "Nhập sai mật khẩu quá nhiều lần, thử lại sau 15 phút"));
  // Kiểm mật khẩu ngoài transaction ghi (băm mật khẩu chậm, không giữ khóa dòng).
  const me = await deps.uow.asOrg(ctx, (r) => r.users.findById(ctx.userId));
  if (!me || !(await deps.hasher.verify(me.passwordHash, input.password))) return err(domainError("INVALID_CREDENTIALS", "Mật khẩu không đúng"));
  await deps.rateLimiter.reset(`transfer-ownership:${ctx.userId}`);

  const now = deps.clock.now();
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const [mine, target] = await Promise.all([r.memberships.find(ctx.orgId, ctx.userId), r.memberships.find(ctx.orgId, targetUserId)]);
    // Đọc lại vai trò trong transaction: phiên có thể đã cũ (vừa chuyển ở tab khác).
    if (!mine || mine.role !== "OWNER") return err(domainError("FORBIDDEN", "Chỉ Chủ sở hữu được chuyển quyền sở hữu"));
    if (!target) return err(domainError("NOT_FOUND", "Không tìm thấy thành viên"));
    const allowed = canTransferOwnership(mine.role, { role: target.role, status: target.status, isSelf: false });
    if (!allowed.ok) return allowed;
    await r.memberships.update(target.id, { role: "OWNER" });
    await r.memberships.update(mine.id, { role: "ADMIN" });
    const org = await r.orgs.findById(ctx.orgId);
    const orgName = org?.name ?? "doanh nghiệp";
    await r.notifications.insert({
      id: deps.idGen.next("ntf"), orgId: ctx.orgId, userId: target.userId,
      title: `Bạn là Chủ sở hữu mới của ${orgName}`, body: `${me.name} đã chuyển quyền sở hữu cho bạn.`, href: "/settings?tab=members", readAt: null, createdAt: now,
    });
    const members = await membersOf(r, [{ ...target, role: "OWNER" }, { ...mine, role: "ADMIN" }]);
    return ok({ owner: members[0]!, previousOwner: members[1]!, orgName });
  });
  if (!res.ok) return res;
  const { owner, previousOwner, orgName } = res.value;
  await deps.mailer.send({ to: owner.email, ...ownershipTransferredMail(deps.appUrl, orgName, me.name) });
  await deps.audit?.record(ctx, { action: "OWNERSHIP_TRANSFERRED", targetType: "member", targetId: owner.id, targetLabel: owner.email, detail: { from: previousOwner.email } });
  return ok({ owner, previousOwner });
}
