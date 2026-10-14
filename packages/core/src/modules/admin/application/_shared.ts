// Dùng chung trong các use case admin: xác định quản trị viên từ phiên, ghi nhật ký, ánh xạ DTO.
import type { AdminAction, AdminAuditEntry, AdminOrg, AdminTargetType, AdminPermission, PlanCode, Staff } from "@kb/contracts";
import { sumDec, toDecimalString } from "../../../shared/decimal.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { activeQuotaBonus, renewsAt } from "../domain/period.js";
import { requirePermission, type StaffActor } from "../domain/staff-rules.js";
import type { AdminDeps, AdminOrgRow, AdminRepos, AuditRow, MemberRow, OrgUsage, PlanRow, StaffRow } from "./ports.js";

export type { StaffActor };

export type StaffSession = { actor: StaffActor; sessionId: string; mfa: { enrolled: boolean; verified: boolean } };

/**
 * Phiên quản trị từ cookie: phiên còn hạn + tài khoản có dòng platform_staff chưa bị khóa. Đăng nhập lần đầu → INVITED thành ACTIVE.
 * KHÔNG đòi xác thực 2 lớp – chỉ dùng cho bước thiết lập/nhập mã 2FA và đọc trạng thái phiên.
 */
export async function resolveStaffSession(deps: AdminDeps, sessionToken: string): Promise<Result<StaffSession>> {
  if (!sessionToken) return err(domainError("UNAUTHENTICATED", "Chưa đăng nhập"));
  const now = deps.clock.now();
  return deps.uow.run(async (r) => {
    const s = await r.sessions.findValid(deps.identity.hashToken(sessionToken), now);
    if (!s) return err(domainError("UNAUTHENTICATED", "Chưa đăng nhập hoặc phiên đã hết hạn"));
    const staff = await r.staff.get(s.userId);
    if (!staff) return err(domainError("FORBIDDEN", "Tài khoản không có quyền quản trị hệ thống"));
    if (staff.status === "DISABLED") return err(domainError("FORBIDDEN", "Tài khoản quản trị đã bị khóa"));
    if (staff.status === "INVITED") await r.staff.update(staff.userId, { status: "ACTIVE" }, now);
    return ok({
      actor: { userId: staff.userId, name: staff.name, email: staff.email, role: staff.role, status: "ACTIVE" as const },
      sessionId: s.id,
      // Phiên chỉ được tính đã xác thực khi tài khoản đang bật 2FA (đặt lại 2FA → phiên cũ hết hiệu lực vì bị xóa).
      mfa: { enrolled: staff.mfaEnabled, verified: staff.mfaEnabled && s.mfaVerifiedAt !== null },
    });
  });
}

/** Quản trị viên cho mọi API quản trị: phiên hợp lệ VÀ đã qua bước xác thực 2 lớp (B11 của spec admin). */
export async function resolveStaff(deps: AdminDeps, sessionToken: string): Promise<Result<StaffActor>> {
  const s = await resolveStaffSession(deps, sessionToken);
  if (!s.ok) return s;
  if (!s.value.mfa.verified) {
    return err(domainError("MFA_REQUIRED", s.value.mfa.enrolled ? "Nhập mã xác thực 2 lớp để tiếp tục" : "Thiết lập xác thực 2 lớp trước khi vào khu quản trị"));
  }
  return ok(s.value.actor);
}

/** Chạy `fn` khi quản trị viên có quyền; ngoài ra trả lỗi FORBIDDEN/UNAUTHENTICATED. */
export async function guarded<T>(actor: StaffActor, permission: AdminPermission, fn: () => Promise<Result<T>>): Promise<Result<T>> {
  const allowed = requirePermission(actor, permission);
  return allowed.ok ? fn() : allowed;
}

export type Target = { type: AdminTargetType; id: string; label: string; orgId?: string; orgName?: string };

/** Ghi một dòng nhật ký quản trị trong transaction đang mở (cùng commit với thao tác). */
export async function audit(deps: AdminDeps, r: AdminRepos, actor: StaffActor, action: AdminAction, target: Target, reason: string, detail?: string): Promise<void> {
  await r.audit.insert({
    id: deps.idGen.next("aud"), at: deps.clock.now(), staffId: actor.userId, staffName: actor.name, action,
    targetType: target.type, targetId: target.id, targetLabel: target.label, orgId: target.orgId ?? null, orgName: target.orgName ?? null, reason, detail: detail ?? null,
  });
}

export const toAuditEntry = (a: AuditRow): AdminAuditEntry => ({
  id: a.id, at: a.at.toISOString(), staffId: a.staffId, staffName: a.staffName, action: a.action as AdminAction, targetType: a.targetType as AdminTargetType,
  targetId: a.targetId, targetLabel: a.targetLabel, ...(a.orgId ? { orgId: a.orgId } : {}), ...(a.orgName ? { orgName: a.orgName } : {}), reason: a.reason, ...(a.detail ? { detail: a.detail } : {}),
});

export const toStaff = (s: StaffRow): Staff => ({
  id: s.userId, name: s.name, email: s.email, role: s.role, status: s.status, mfaEnabled: s.mfaEnabled, ...(s.lastActiveAt ? { lastActiveAt: s.lastActiveAt.toISOString() } : {}),
});

export const orgTarget = (o: AdminOrgRow): Target => ({ type: "ORG", id: o.id, label: o.name, orgId: o.id, orgName: o.name });

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Doanh nghiệp → DTO tổng hợp (không có nội dung hồ sơ). `usage` = số liệu tháng hiện tại. */
export function toAdminOrg(o: AdminOrgRow, plans: Map<string, PlanRow>, members: MemberRow[], usage: OrgUsage | undefined, now: Date): AdminOrg {
  const plan = plans.get(o.planCode);
  const own = members.filter((m) => m.orgId === o.id);
  const owner = own.find((m) => m.role === "OWNER" && m.status === "ACTIVE") ?? own.find((m) => m.role === "OWNER");
  const lastSeen = own.map((m) => m.lastSeenAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
  const cost = usage ? [usage.readCostVnd, usage.hsCostVnd, usage.customsCostVnd] : [];
  return {
    id: o.id,
    name: o.name,
    taxCode: o.taxCode,
    status: o.status,
    ...(o.suspendedReason ? { suspendedReason: o.suspendedReason } : {}),
    plan: { code: o.planCode as PlanCode, name: plan?.name ?? o.planCode, dossiersPerMonth: plan?.dossiersPerMonth ?? 0, pagesPerDossier: plan?.pagesPerDossier ?? 0, renewsAt: isoDate(renewsAt(o, now)) },
    quotaBonus: activeQuotaBonus(o, now),
    usage: { dossiersThisMonth: usage?.dossiers ?? 0, pagesThisMonth: usage?.pages ?? 0, aiCostVnd: sumMoney(cost) },
    memberCount: own.filter((m) => m.status !== "DISABLED").length,
    ownerName: owner?.name ?? "—",
    ownerEmail: owner?.email ?? "",
    createdAt: o.createdAt.toISOString(),
    ...(lastSeen > 0 ? { lastActiveAt: new Date(lastSeen).toISOString() } : {}),
  };
}

/** Tổng tiền VND, làm tròn đồng. */
export const sumMoney = (list: string[]) => toDecimalString(sumDec(list), 0);
