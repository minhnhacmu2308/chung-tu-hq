import type { Member } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canManageOrg } from "../domain/role-rules.js";
import { joinApprovedMail } from "./_mail-templates.js";
import { toMember } from "./_to-dto.js";
import type { IdentityDeps } from "./ports.js";

/** Duyệt yêu cầu tham gia → membership DECLARANT ACTIVE; báo cho người xin bằng thông báo + email. */
export async function approveJoinRequest(deps: IdentityDeps, ctx: Ctx, requestId: string): Promise<Result<Member>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const jr = await r.joinRequests.findById(requestId);
    if (!jr || jr.orgId !== ctx.orgId || jr.status !== "PENDING") return err(domainError("NOT_FOUND", "Không tìm thấy yêu cầu đang chờ"));
    const membership = { id: deps.idGen.next("mem"), orgId: ctx.orgId, userId: jr.userId, role: "DECLARANT" as const, status: "ACTIVE" as const, invitedBy: ctx.userId };
    await r.memberships.insert(membership);
    await r.joinRequests.decide(jr.id, "APPROVED", ctx.userId, now);
    const org = await r.orgs.findById(ctx.orgId);
    await r.notifications.insert({ id: deps.idGen.next("ntf"), orgId: ctx.orgId, userId: jr.userId, title: `Bạn đã được duyệt vào ${org?.name ?? "doanh nghiệp"}`, body: "Bắt đầu tạo hồ sơ khai báo.", href: "/", readAt: null, createdAt: now });
    return ok({ membership, orgName: org?.name ?? "", userId: jr.userId });
  });
  if (!res.ok) return res;
  const user = await deps.uow.system((r) => r.users.findById(res.value.userId));
  if (user) await deps.mailer.send({ to: user.email, ...joinApprovedMail(deps.appUrl, res.value.orgName) });
  return ok(toMember(user!, res.value.membership));
}
