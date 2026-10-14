// Người dùng toàn hệ thống: mỗi dòng là một tài khoản trong một doanh nghiệp (membership) hoặc một yêu cầu tham gia đang chờ.
import type { AdminReasonInput, AdminUser } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { deviceLabel } from "../domain/sanitize.js";
import { audit, guarded, type StaffActor, type Target } from "./_shared.js";
import type { AdminDeps, AdminRepos, JoinRow, MemberRow, SessionInfo } from "./ports.js";

/** id của dòng người dùng = "<orgId>~<userId>" (một tài khoản có thể ở nhiều doanh nghiệp). */
export const adminUserId = (orgId: string, userId: string) => `${orgId}~${userId}`;
function parseAdminUserId(id: string): { orgId: string; userId: string } | null {
  const [orgId, userId, extra] = id.split("~");
  return orgId && userId && extra === undefined ? { orgId, userId } : null;
}

const toSessions = (all: SessionInfo[], m: { userId: string; orgId: string }) =>
  all.filter((s) => s.userId === m.userId && s.orgId === m.orgId).map((s) => ({ id: s.id, device: deviceLabel(s.userAgent), ip: s.ip ?? "—", lastSeenAt: s.lastSeenAt.toISOString() }));

function memberDto(m: MemberRow, orgName: string, sessions: SessionInfo[]): AdminUser {
  return {
    id: adminUserId(m.orgId, m.userId), name: m.name, email: m.email, orgId: m.orgId, orgName, role: m.role, status: m.status, emailVerified: m.emailVerified,
    createdAt: m.createdAt.toISOString(), ...(m.lastSeenAt ? { lastActiveAt: m.lastSeenAt.toISOString() } : {}),
    sessions: m.status === "ACTIVE" ? toSessions(sessions, m) : [],
  };
}

const joinDto = (j: JoinRow, orgName: string): AdminUser => ({
  id: adminUserId(j.orgId, j.userId), name: j.name, email: j.email, orgId: j.orgId, orgName, role: "VIEWER", status: "PENDING_JOIN", emailVerified: j.emailVerified,
  createdAt: j.createdAt.toISOString(), joinRequestedAt: j.requestedAt.toISOString(), sessions: [],
});

async function loadUsers(deps: AdminDeps, r: AdminRepos, orgId?: string): Promise<AdminUser[]> {
  const [orgs, members, joins] = await Promise.all([r.orgs.list(), r.members.list(orgId), r.joins.listPending(orgId)]);
  const names = new Map(orgs.map((o) => [o.id, o.name]));
  const sessions = await r.sessions.listByUsers([...new Set(members.map((m) => m.userId))], deps.clock.now());
  return [...members.map((m) => memberDto(m, names.get(m.orgId) ?? "—", sessions)), ...joins.map((j) => joinDto(j, names.get(j.orgId) ?? "—"))];
}

export async function listUsers(deps: AdminDeps, actor: StaffActor, filter: { orgId?: string } = {}): Promise<Result<AdminUser[]>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => ok((await loadUsers(deps, r, filter.orgId)).sort((a, b) => (b.lastActiveAt ?? b.createdAt).localeCompare(a.lastActiveAt ?? a.createdAt)))),
  );
}

/** Thao tác hỗ trợ trên một dòng người dùng: tìm thành viên → `fn` → trả dòng sau khi đổi. */
async function onMember(deps: AdminDeps, actor: StaffActor, id: string, fn: (r: AdminRepos, m: MemberRow, target: Target) => Promise<Result<void>>): Promise<Result<AdminUser>> {
  return guarded(actor, "SUPPORT", () =>
    deps.uow.run(async (r) => {
      const key = parseAdminUserId(id);
      const m = key ? (await r.members.list(key.orgId)).find((x) => x.userId === key.userId) : undefined;
      if (!key || !m) return err(domainError("NOT_FOUND", "Không tìm thấy người dùng"));
      const org = await r.orgs.get(m.orgId);
      const done = await fn(r, m, { type: "USER", id, label: m.name, orgId: m.orgId, ...(org ? { orgName: org.name } : {}) });
      if (!done.ok) return done;
      return ok((await loadUsers(deps, r, m.orgId)).find((u) => u.id === id)!);
    }),
  );
}

/** Khóa/mở tài khoản trong doanh nghiệp. Khóa = đăng xuất ngay mọi phiên ở doanh nghiệp đó. */
export async function setUserDisabled(deps: AdminDeps, actor: StaffActor, id: string, disabled: boolean, input: AdminReasonInput): Promise<Result<AdminUser>> {
  return onMember(deps, actor, id, async (r, m, target) => {
    if (m.status === "INVITED") return err(domainError("CONFLICT", "Tài khoản chưa kích hoạt nên không khóa/mở được"));
    if (disabled === (m.status === "DISABLED")) return err(domainError("CONFLICT", disabled ? "Tài khoản đã bị khóa" : "Tài khoản đang hoạt động"));
    await r.members.setStatus(m.orgId, m.userId, disabled ? "DISABLED" : "ACTIVE");
    if (disabled) await r.sessions.deleteByUser(m.userId, m.orgId);
    await audit(deps, r, actor, disabled ? "USER_DISABLED" : "USER_ENABLED", target, input.reason);
    return ok(undefined);
  });
}

export async function sendPasswordReset(deps: AdminDeps, actor: StaffActor, id: string, input: AdminReasonInput): Promise<Result<AdminUser>> {
  return onMember(deps, actor, id, async (r, m, target) => {
    if (m.status !== "ACTIVE") return err(domainError("CONFLICT", "Chỉ gửi đặt lại mật khẩu cho tài khoản đang hoạt động"));
    const sent = await deps.identity.sendPasswordReset(m.email);
    if (!sent.ok) return sent;
    await audit(deps, r, actor, "USER_PASSWORD_RESET_SENT", target, input.reason);
    return ok(undefined);
  });
}

export async function resendVerification(deps: AdminDeps, actor: StaffActor, id: string, input: AdminReasonInput): Promise<Result<AdminUser>> {
  return onMember(deps, actor, id, async (r, m, target) => {
    if (m.emailVerified) return err(domainError("CONFLICT", "Email của tài khoản này đã được xác thực"));
    const sent = await deps.identity.resendVerification(m.userId);
    if (!sent.ok) return sent;
    await audit(deps, r, actor, "USER_VERIFICATION_RESENT", target, input.reason);
    return ok(undefined);
  });
}

/** Đăng xuất mọi phiên của tài khoản ở doanh nghiệp này. */
export async function revokeUserSessions(deps: AdminDeps, actor: StaffActor, id: string, input: AdminReasonInput): Promise<Result<AdminUser>> {
  return onMember(deps, actor, id, async (r, m, target) => {
    const n = await r.sessions.deleteByUser(m.userId, m.orgId);
    if (n === 0) return err(domainError("CONFLICT", "Tài khoản không có phiên đăng nhập nào"));
    await audit(deps, r, actor, "USER_SESSIONS_REVOKED", target, input.reason, `${n} phiên`);
    return ok(undefined);
  });
}
