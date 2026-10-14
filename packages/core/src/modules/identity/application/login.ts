import type { LoginInput } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { createSession } from "./_session.js";
import type { IdentityDeps } from "./ports.js";

const INVALID = () => err(domainError("INVALID_CREDENTIALS", "Sai email hoặc mật khẩu"));

export async function login(deps: IdentityDeps, input: LoginInput, meta: { ip: string }): Promise<Result<{ sessionToken: string }>> {
  const rlKey = `login:${input.email}:${meta.ip}`;
  const rl = await deps.rateLimiter.hit(rlKey, 10, 900);
  if (!rl.allowed) return err(domainError("RATE_LIMITED", "Đăng nhập sai quá nhiều lần, thử lại sau 15 phút"));

  const user = await deps.uow.system((r) => r.users.findByEmail(input.email));
  if (!user) return INVALID();
  if (!(await deps.hasher.verify(user.passwordHash, input.password))) return INVALID();
  // Mật khẩu đúng → bỏ đếm: chỉ các lần sai liên tiếp mới bị khóa, người đăng nhập/đăng xuất nhiều lần không bị chặn nhầm.
  await deps.rateLimiter.reset(rlKey);

  // Quản trị viên hệ thống không cần thuộc doanh nghiệp nào: phiên không có org, chỉ vào được khu /admin.
  const staff = await deps.platformStaff?.(user.id);
  if (staff?.status === "DISABLED") return err(domainError("MEMBERSHIP_DISABLED", "Tài khoản quản trị đã bị khóa"));

  // Ngữ cảnh user: memberships/join_requests của chính mình, tạo phiên.
  return deps.uow.asUser(asUserId(user.id), async (r) => {
    const memberships = await r.memberships.listByUser(user.id);
    // Bỏ qua doanh nghiệp đang bị tạm khóa; chỉ còn doanh nghiệp tạm khóa → báo lý do.
    const activeOrgs: { membership: (typeof memberships)[number]; suspended: boolean }[] = [];
    for (const m of memberships.filter((x) => x.status === "ACTIVE")) activeOrgs.push({ membership: m, suspended: (await r.orgs.findById(m.orgId))?.status === "SUSPENDED" });
    const active = activeOrgs.find((x) => !x.suspended)?.membership;
    if (!active) {
      if (staff) return ok({ sessionToken: await createSession(deps, r, user.id, null) });
      if (activeOrgs.length > 0) return err(domainError("ORG_SUSPENDED", "Doanh nghiệp đang tạm khóa – liên hệ KhaiBáo AI để được hỗ trợ"));
      if (memberships.some((m) => m.status === "DISABLED")) return err(domainError("MEMBERSHIP_DISABLED", "Tài khoản đã bị khóa trong doanh nghiệp"));
      if (memberships.some((m) => m.status === "INVITED")) return err(domainError("MEMBERSHIP_PENDING", "Bạn chưa chấp nhận lời mời; mở email mời để đặt mật khẩu"));
      if ((await r.joinRequests.findPendingByUser(user.id)).length > 0) return err(domainError("MEMBERSHIP_PENDING", "Yêu cầu tham gia đang chờ Chủ sở hữu duyệt"));
      return err(domainError("NO_ORGANIZATION", "Tài khoản chưa thuộc doanh nghiệp nào"));
    }
    const sessionToken = await createSession(deps, r, user.id, active.orgId);
    return ok({ sessionToken });
  });
}
