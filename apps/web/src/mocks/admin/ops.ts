// Nghiệp vụ back-office của bản mock, viết thành hàm thuần trên "DB" để kiểm thử được (ops.test.ts).
// mocks/api/admin.ts chỉ bọc các hàm này bằng độ trễ mạng giả. Backend thật sẽ thay toàn bộ file này.
import {
  AdjustOrgQuotaInputSchema, AdminReasonInputSchema, ChangeOrgPlanInputSchema, ChangeStaffRoleInputSchema, ExtendOrgTrialInputSchema,
  InviteStaffInputSchema, SendAnnouncementInputSchema, SetTemplatePublishedInputSchema, staffCan, UpdateIntegrationKeyInputSchema,
  UpdatePlanInputSchema, UsageMonthSchema,
  type AdminAction, type AdminAuditEntry, type AdminOrg, type AdminOrgDetail, type AdminOverview, type AdminPermission, type AdminPlan,
  type AdminSession, type AdminTargetType, type AdminUser, type Announcement, type AttentionItem, type FailedJob, type IntegrationId,
  type Organization, type OrgUsageRow, type PlanCode, type PlatformIntegration, type SkillTemplate, type Staff, type SystemHealth,
  type UsageReport,
} from "@kb/contracts";
import type { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { fromMinor, sumMinor, toMinor } from "@/lib/decimal";
import type { MockDb } from "../db";
import type { OrgMeta, StoredUser, UserMeta } from "./types";

/** Phần của DB mà back-office đọc/ghi. */
export type AdminScope = Pick<MockDb, "org" | "members" | "integrations" | "certificates" | "notifications" | "admin">;

const DAY = 86_400_000;
const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysUntil = (isoDate: string) => Math.round((new Date(`${isoDate}T00:00:00Z`).getTime() - new Date(`${isoDay(Date.now())}T00:00:00Z`).getTime()) / DAY);

/** Dữ liệu từ form đi qua đúng schema dùng chung với backend (bất biến 9). */
function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError("VALIDATION", r.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  return r.data;
}

/* ---------------- Phiên & quyền ---------------- */

function actor(db: AdminScope, permission: AdminPermission): Staff {
  const s = db.admin.staff.find((x) => x.id === db.admin.currentStaffId);
  if (!s || s.status !== "ACTIVE") throw new ApiError("UNAUTHENTICATED", "Phiên quản trị đã hết hạn – đăng nhập lại", 401);
  if (!staffCan(s.role, permission)) throw new ApiError("FORBIDDEN", "Vai trò của bạn không được thực hiện thao tác này", 403);
  return s;
}

type Target = { type: AdminTargetType; id: string; label: string; orgId?: string; orgName?: string };

function log(db: AdminScope, staff: Staff, action: AdminAction, target: Target, reason: string, detail?: string): AdminAuditEntry {
  const entry: AdminAuditEntry = {
    id: newId("aud"),
    at: nowIso(),
    staffId: staff.id,
    staffName: staff.name,
    action,
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.label,
    ...(target.orgId ? { orgId: target.orgId } : {}),
    ...(target.orgName ? { orgName: target.orgName } : {}),
    reason,
    ...(detail ? { detail } : {}),
  };
  db.admin.audit.unshift(entry);
  return entry;
}

export function adminLogin(db: AdminScope, email: string, password: string): AdminSession {
  const s = db.admin.staff.find((x) => x.email === email.trim().toLowerCase());
  if (!s || password.length < 6) throw new ApiError("INVALID_CREDENTIALS", "Sai email hoặc mật khẩu", 401);
  if (s.status === "DISABLED") throw new ApiError("FORBIDDEN", "Tài khoản quản trị này đã bị khóa", 403);
  if (s.status === "INVITED") throw new ApiError("FORBIDDEN", "Tài khoản chưa kích hoạt – mở liên kết trong email mời trước", 403);
  s.lastActiveAt = nowIso();
  db.admin.currentStaffId = s.id;
  return { staff: s };
}

export function adminLogout(db: AdminScope): void {
  db.admin.currentStaffId = null;
}

export function getAdminSession(db: AdminScope): AdminSession | null {
  const s = db.admin.staff.find((x) => x.id === db.admin.currentStaffId);
  return s && s.status === "ACTIVE" ? { staff: s } : null;
}

/* ---------------- Doanh nghiệp ---------------- */

type OrgRef = { org: Organization; meta: OrgMeta };

/** Doanh nghiệp demo (đang dùng ở ứng dụng khách) + các doanh nghiệp mẫu khác. Trả về tham chiếu để ghi thẳng. */
function orgRefs(db: AdminScope): OrgRef[] {
  return [{ org: db.org, meta: db.admin.demoOrgMeta }, ...db.admin.orgs];
}

function orgRef(db: AdminScope, id: string): OrgRef {
  const r = orgRefs(db).find((x) => x.org.id === id);
  if (!r) throw new ApiError("NOT_FOUND", "Không tìm thấy doanh nghiệp", 404);
  return r;
}

const DEFAULT_USER_META = (): UserMeta => ({ emailVerified: true, createdAt: nowIso(), sessions: [] });

function allUsers(db: AdminScope): AdminUser[] {
  const names = new Map(orgRefs(db).map((r) => [r.org.id, r.org.name]));
  const demo = db.members.map((m): AdminUser => {
    const meta = db.admin.demoUserMeta[m.id] ?? { ...DEFAULT_USER_META(), emailVerified: m.status !== "INVITED" };
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      orgId: db.org.id,
      orgName: db.org.name,
      role: m.role,
      status: m.status,
      emailVerified: meta.emailVerified,
      createdAt: meta.createdAt,
      ...(m.lastActiveAt ? { lastActiveAt: m.lastActiveAt } : {}),
      sessions: m.status === "ACTIVE" ? meta.sessions : [],
    };
  });
  return [...demo, ...db.admin.users.map((u): AdminUser => ({ ...u, orgName: names.get(u.orgId) ?? "—" }))];
}

function toAdminOrg(r: OrgRef, users: readonly AdminUser[]): AdminOrg {
  const members = users.filter((u) => u.orgId === r.org.id && u.status !== "PENDING_JOIN");
  const owner = members.find((u) => u.role === "OWNER");
  const lastActiveAt = members.map((u) => u.lastActiveAt ?? "").sort().at(-1);
  return {
    id: r.org.id,
    name: r.org.name,
    taxCode: r.org.taxCode,
    status: r.meta.status,
    ...(r.meta.suspendedReason ? { suspendedReason: r.meta.suspendedReason } : {}),
    plan: r.org.plan,
    quotaBonus: r.meta.quotaBonus,
    usage: r.org.usage,
    memberCount: members.length,
    ownerName: owner?.name ?? "—",
    ownerEmail: owner?.email ?? "",
    createdAt: r.meta.createdAt,
    ...(lastActiveAt ? { lastActiveAt } : {}),
  };
}

export function listOrgs(db: AdminScope): AdminOrg[] {
  actor(db, "VIEW");
  const users = allUsers(db);
  return orgRefs(db).map((r) => toAdminOrg(r, users)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOrg(db: AdminScope, id: string): AdminOrgDetail {
  actor(db, "VIEW");
  const r = orgRef(db, id);
  const demo = r.org === db.org;
  return {
    ...toAdminOrg(r, allUsers(db)),
    address: r.org.address,
    phone: r.org.phone,
    // Doanh nghiệp mẫu khác không có dữ liệu kết nối riêng trong bản mock.
    integrations: demo ? db.integrations.map((i) => ({ id: i.id, name: i.name, status: i.status })) : [],
    certificates: demo ? db.certificates.map((c) => ({ id: c.id, issuer: c.issuer, validTo: c.validTo, isDefault: c.isDefault })) : [],
  };
}

const orgTarget = (r: OrgRef): Target => ({ type: "ORG", id: r.org.id, label: r.org.name, orgId: r.org.id, orgName: r.org.name });

export function suspendOrg(db: AdminScope, id: string, input: unknown): AdminOrg {
  const staff = actor(db, "SUPPORT");
  const { reason } = parse(AdminReasonInputSchema, input);
  const r = orgRef(db, id);
  if (r.meta.status === "SUSPENDED") throw new ApiError("CONFLICT", "Doanh nghiệp này đang bị tạm khóa", 409);
  r.meta.status = "SUSPENDED";
  r.meta.suspendedReason = reason;
  log(db, staff, "ORG_SUSPENDED", orgTarget(r), reason);
  return toAdminOrg(r, allUsers(db));
}

export function reactivateOrg(db: AdminScope, id: string, input: unknown): AdminOrg {
  const staff = actor(db, "SUPPORT");
  const { reason } = parse(AdminReasonInputSchema, input);
  const r = orgRef(db, id);
  if (r.meta.status === "ACTIVE") throw new ApiError("CONFLICT", "Doanh nghiệp này đang hoạt động", 409);
  r.meta.status = "ACTIVE";
  delete r.meta.suspendedReason;
  log(db, staff, "ORG_REACTIVATED", orgTarget(r), reason);
  return toAdminOrg(r, allUsers(db));
}

function planOf(db: AdminScope, code: PlanCode) {
  const p = db.admin.plans.find((x) => x.code === code);
  if (!p) throw new ApiError("NOT_FOUND", "Không tìm thấy gói dịch vụ", 404);
  return p;
}

export function changeOrgPlan(db: AdminScope, id: string, input: unknown): AdminOrg {
  const staff = actor(db, "BILLING");
  const { planCode, reason } = parse(ChangeOrgPlanInputSchema, input);
  const r = orgRef(db, id);
  if (r.org.plan.code === planCode) throw new ApiError("CONFLICT", "Doanh nghiệp đang dùng đúng gói này", 409);
  const next = planOf(db, planCode);
  const before = r.org.plan.name;
  // Đổi gói bắt đầu kỳ mới 30 ngày.
  r.org.plan = { code: next.code, name: next.name, dossiersPerMonth: next.dossiersPerMonth, pagesPerDossier: next.pagesPerDossier, renewsAt: isoDay(Date.now() + 30 * DAY) };
  log(db, staff, "ORG_PLAN_CHANGED", orgTarget(r), reason, `${before} → ${next.name}`);
  return toAdminOrg(r, allUsers(db));
}

export function adjustOrgQuota(db: AdminScope, id: string, input: unknown): AdminOrg {
  const staff = actor(db, "BILLING");
  const { bonusDossiers, reason } = parse(AdjustOrgQuotaInputSchema, input);
  const r = orgRef(db, id);
  r.meta.quotaBonus = bonusDossiers;
  log(db, staff, "ORG_QUOTA_ADJUSTED", orgTarget(r), reason, bonusDossiers > 0 ? `+${bonusDossiers} hồ sơ tháng này` : "Bỏ phần nới hạn mức");
  return toAdminOrg(r, allUsers(db));
}

export function extendOrgTrial(db: AdminScope, id: string, input: unknown): AdminOrg {
  const staff = actor(db, "BILLING");
  const { days, reason } = parse(ExtendOrgTrialInputSchema, input);
  const r = orgRef(db, id);
  if (r.org.plan.code !== "TRIAL") throw new ApiError("CONFLICT", "Chỉ gia hạn được cho doanh nghiệp đang dùng thử", 409);
  // Dùng thử đã hết hạn thì tính từ hôm nay.
  const from = Math.max(Date.now(), new Date(`${r.org.plan.renewsAt}T00:00:00Z`).getTime());
  r.org.plan.renewsAt = isoDay(from + days * DAY);
  log(db, staff, "ORG_TRIAL_EXTENDED", orgTarget(r), reason, `+${days} ngày dùng thử`);
  return toAdminOrg(r, allUsers(db));
}

/* ---------------- Người dùng ---------------- */

export function listUsers(db: AdminScope, filter: { orgId?: string } = {}): AdminUser[] {
  actor(db, "VIEW");
  return allUsers(db)
    .filter((u) => !filter.orgId || u.orgId === filter.orgId)
    .sort((a, b) => (b.lastActiveAt ?? b.createdAt).localeCompare(a.lastActiveAt ?? a.createdAt));
}

type UserHandle = { status: StoredUser["status"]; setStatus: (s: "ACTIVE" | "DISABLED") => void; meta: UserMeta; target: Target };

/** Tài khoản nằm ở doanh nghiệp demo (db.members) hay ở danh sách mẫu – trả về chỗ để ghi. */
function userHandle(db: AdminScope, id: string): UserHandle {
  const member = db.members.find((m) => m.id === id);
  if (member) {
    const meta = (db.admin.demoUserMeta[id] ??= { ...DEFAULT_USER_META(), emailVerified: member.status !== "INVITED" });
    return {
      status: member.status,
      setStatus: (s: "ACTIVE" | "DISABLED") => void (member.status = s),
      meta,
      target: { type: "USER", id, label: member.name, orgId: db.org.id, orgName: db.org.name },
    };
  }
  const user = db.admin.users.find((u) => u.id === id);
  if (!user) throw new ApiError("NOT_FOUND", "Không tìm thấy người dùng", 404);
  const org = orgRefs(db).find((r) => r.org.id === user.orgId)?.org;
  return {
    status: user.status,
    setStatus: (s: "ACTIVE" | "DISABLED") => void (user.status = s),
    // Người dùng mẫu giữ emailVerified/sessions ngay trên bản ghi.
    meta: user,
    target: { type: "USER", id, label: user.name, orgId: user.orgId, ...(org ? { orgName: org.name } : {}) },
  };
}

const userById = (db: AdminScope, id: string) => allUsers(db).find((u) => u.id === id)!;

export function setUserDisabled(db: AdminScope, id: string, disabled: boolean, input: unknown): AdminUser {
  const staff = actor(db, "SUPPORT");
  const { reason } = parse(AdminReasonInputSchema, input);
  const h = userHandle(db, id);
  if (h.status !== "ACTIVE" && h.status !== "DISABLED") throw new ApiError("CONFLICT", "Tài khoản chưa kích hoạt nên không khóa/mở được", 409);
  if (disabled === (h.status === "DISABLED")) throw new ApiError("CONFLICT", disabled ? "Tài khoản đã bị khóa" : "Tài khoản đang hoạt động", 409);
  h.setStatus(disabled ? "DISABLED" : "ACTIVE");
  if (disabled) h.meta.sessions = []; // khóa là đăng xuất ngay mọi phiên
  log(db, staff, disabled ? "USER_DISABLED" : "USER_ENABLED", h.target, reason);
  return userById(db, id);
}

export function sendPasswordReset(db: AdminScope, id: string, input: unknown): AdminUser {
  const staff = actor(db, "SUPPORT");
  const { reason } = parse(AdminReasonInputSchema, input);
  const h = userHandle(db, id);
  if (h.status !== "ACTIVE") throw new ApiError("CONFLICT", "Chỉ gửi đặt lại mật khẩu cho tài khoản đang hoạt động", 409);
  log(db, staff, "USER_PASSWORD_RESET_SENT", h.target, reason);
  return userById(db, id);
}

export function resendVerification(db: AdminScope, id: string, input: unknown): AdminUser {
  const staff = actor(db, "SUPPORT");
  const { reason } = parse(AdminReasonInputSchema, input);
  const h = userHandle(db, id);
  if (h.meta.emailVerified) throw new ApiError("CONFLICT", "Email của tài khoản này đã được xác thực", 409);
  log(db, staff, "USER_VERIFICATION_RESENT", h.target, reason);
  return userById(db, id);
}

export function revokeUserSessions(db: AdminScope, id: string, input: unknown): AdminUser {
  const staff = actor(db, "SUPPORT");
  const { reason } = parse(AdminReasonInputSchema, input);
  const h = userHandle(db, id);
  const n = h.meta.sessions.length;
  if (n === 0) throw new ApiError("CONFLICT", "Tài khoản không có phiên đăng nhập nào", 409);
  h.meta.sessions = [];
  log(db, staff, "USER_SESSIONS_REVOKED", h.target, reason, `${n} phiên`);
  return userById(db, id);
}

/* ---------------- Gói dịch vụ ---------------- */

export function listPlans(db: AdminScope): AdminPlan[] {
  actor(db, "VIEW");
  const refs = orgRefs(db);
  return db.admin.plans.map((p) => ({ ...p, orgCount: refs.filter((r) => r.org.plan.code === p.code).length }));
}

export function updatePlan(db: AdminScope, code: PlanCode, input: unknown): AdminPlan {
  const staff = actor(db, "BILLING");
  const v = parse(UpdatePlanInputSchema, input);
  const p = planOf(db, code);
  const changes = [
    p.name !== v.name && `Tên ${p.name} → ${v.name}`,
    p.dossiersPerMonth !== v.dossiersPerMonth && `Hồ sơ/tháng ${p.dossiersPerMonth} → ${v.dossiersPerMonth}`,
    p.pagesPerDossier !== v.pagesPerDossier && `Trang/hồ sơ ${p.pagesPerDossier} → ${v.pagesPerDossier}`,
    toMinor(p.priceVnd, 0) !== toMinor(v.priceVnd, 0) && `Giá ${p.priceVnd} → ${v.priceVnd} VND`,
  ].filter(Boolean);
  if (changes.length === 0) throw new ApiError("CONFLICT", "Chưa có thay đổi nào", 409);
  Object.assign(p, { name: v.name, dossiersPerMonth: v.dossiersPerMonth, pagesPerDossier: v.pagesPerDossier, priceVnd: fromMinor(toMinor(v.priceVnd, 0), 0) });
  // Doanh nghiệp đang dùng gói nhận hạn mức mới ngay.
  for (const r of orgRefs(db)) {
    if (r.org.plan.code === code) Object.assign(r.org.plan, { name: p.name, dossiersPerMonth: p.dossiersPerMonth, pagesPerDossier: p.pagesPerDossier });
  }
  log(db, staff, "PLAN_UPDATED", { type: "PLAN", id: code, label: `Gói ${p.name}` }, v.reason, changes.join(" · "));
  return listPlans(db).find((x) => x.code === code)!;
}

/* ---------------- Sử dụng & chi phí ---------------- */

const MONTHS_BACK = 6;

/** 6 tháng gần nhất, mới nhất đứng đầu: ["2026-10", "2026-09", …]. */
export function usageMonths(now = new Date()): string[] {
  return Array.from({ length: MONTHS_BACK }, (_, k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    return d.toISOString().slice(0, 7);
  });
}

function usageRow(db: AdminScope, r: OrgRef, dossiers: number, pages: number, totalCost: number): OrgUsageRow {
  // Tách giá vốn theo loại lệnh gọi: đọc chứng từ ~72%, gợi ý HS ~20%, còn lại là Customs Hub.
  const read = Math.round(totalCost * 0.72);
  const hs = Math.round(totalCost * 0.2);
  const customs = totalCost - read - hs;
  const price = toMinor(planOf(db, r.org.plan.code).priceVnd, 0);
  return {
    orgId: r.org.id,
    orgName: r.org.name,
    planCode: r.org.plan.code,
    planName: r.org.plan.name,
    dossiers,
    pages,
    aiCalls: Math.round(pages * 1.25) + dossiers * 2,
    readCostVnd: fromMinor(read, 0),
    hsCostVnd: fromMinor(hs, 0),
    customsCostVnd: fromMinor(customs, 0),
    totalCostVnd: fromMinor(totalCost, 0),
    planPriceVnd: fromMinor(price, 0),
    marginVnd: fromMinor(price - totalCost, 0),
  };
}

export function getUsageReport(db: AdminScope, monthInput: string): UsageReport {
  actor(db, "VIEW");
  const month = parse(UsageMonthSchema, monthInput);
  const k = usageMonths().indexOf(month);
  if (k < 0) throw new ApiError("NOT_FOUND", "Chưa có số liệu cho tháng này", 404);
  const rows = orgRefs(db)
    .map((r, i): OrgUsageRow | null => {
      if (r.meta.createdAt.slice(0, 7) > month) return null; // chưa đăng ký ở tháng đó
      const u = r.org.usage;
      if (k === 0) return usageRow(db, r, u.dossiersThisMonth, u.pagesThisMonth, toMinor(u.aiCostVnd, 0));
      // Tháng cũ: số mô phỏng ổn định theo (doanh nghiệp, tháng) – không ngẫu nhiên để F5 không đổi.
      const base = Math.max(u.dossiersThisMonth, Math.round(r.org.plan.dossiersPerMonth * 0.3));
      const dossiers = Math.round((base * (60 + ((i * 7 + k * 13) % 50))) / 100);
      return usageRow(db, r, dossiers, dossiers * (8 + (i % 5)), dossiers * (2400 + ((i * 137) % 900)));
    })
    .filter((x): x is OrgUsageRow => x !== null)
    .sort((a, b) => toMinor(b.totalCostVnd, 0) - toMinor(a.totalCostVnd, 0));
  const cost = sumMinor(rows.map((x) => toMinor(x.totalCostVnd, 0)));
  const revenue = sumMinor(rows.map((x) => toMinor(x.planPriceVnd, 0)));
  return {
    month,
    rows,
    totals: {
      dossiers: rows.reduce((n, x) => n + x.dossiers, 0),
      pages: rows.reduce((n, x) => n + x.pages, 0),
      aiCalls: rows.reduce((n, x) => n + x.aiCalls, 0),
      totalCostVnd: fromMinor(cost, 0),
      revenueVnd: fromMinor(revenue, 0),
      marginVnd: fromMinor(revenue - cost, 0),
    },
  };
}

/* ---------------- Tích hợp dùng chung ---------------- */

export function listPlatformIntegrations(db: AdminScope): PlatformIntegration[] {
  actor(db, "VIEW");
  return db.admin.integrations;
}

function integrationOf(db: AdminScope, id: IntegrationId): PlatformIntegration {
  const it = db.admin.integrations.find((x) => x.id === id);
  if (!it) throw new ApiError("NOT_FOUND", "Không tìm thấy tích hợp", 404);
  return it;
}

export function testPlatformIntegration(db: AdminScope, id: IntegrationId): PlatformIntegration {
  actor(db, "SUPPORT");
  const it = integrationOf(db, id);
  if (!it.keyLast4) throw new ApiError("NOT_CONFIGURED", "Chưa có khóa API – cập nhật khóa trước khi kiểm tra", 409);
  it.lastCheckedAt = nowIso();
  if (db.admin.brokenKeys.includes(id)) {
    it.status = "ERROR";
    it.detail = "401 Unauthorized – khóa đã bị nhà cung cấp thu hồi. Cập nhật khóa mới để dùng lại.";
  } else {
    it.status = "CONNECTED";
    it.detail = `Gọi thử thành công · môi trường ${it.environment === "PRODUCTION" ? "chính thức" : "sandbox"}`;
  }
  return it;
}

export function updateIntegrationKey(db: AdminScope, id: IntegrationId, input: unknown): PlatformIntegration {
  const staff = actor(db, "PLATFORM");
  const { apiKey, reason } = parse(UpdateIntegrationKeyInputSchema, input);
  const it = integrationOf(db, id);
  // Chỉ giữ 4 ký tự cuối để nhận diện; khóa đầy đủ thuộc về kho bí mật phía máy chủ.
  it.keyLast4 = apiKey.slice(-4);
  it.keyUpdatedAt = nowIso();
  it.lastCheckedAt = nowIso();
  it.status = "CONNECTED";
  it.detail = "Đã lưu khóa mới và gọi thử thành công";
  db.admin.brokenKeys = db.admin.brokenKeys.filter((x) => x !== id);
  log(db, staff, "INTEGRATION_KEY_UPDATED", { type: "INTEGRATION", id, label: it.name }, reason, `Khóa mới kết thúc bằng ${it.keyLast4}`);
  return it;
}

/* ---------------- Sức khỏe hệ thống ---------------- */

export function getSystemHealth(db: AdminScope): SystemHealth {
  actor(db, "VIEW");
  return { services: db.admin.services, queues: db.admin.queues, failedJobs: db.admin.failedJobs };
}

export function retryJob(db: AdminScope, id: string, input: unknown): FailedJob {
  const staff = actor(db, "SUPPORT");
  const { reason } = parse(AdminReasonInputSchema, input);
  const job = db.admin.failedJobs.find((j) => j.id === id);
  if (!job) throw new ApiError("NOT_FOUND", "Không tìm thấy job – có thể đã được chạy lại", 404);
  db.admin.failedJobs = db.admin.failedJobs.filter((j) => j.id !== id);
  const q = db.admin.queues.find((x) => x.id === job.queueId);
  if (q) {
    q.failed = Math.max(0, q.failed - 1);
    q.waiting += 1;
  }
  log(db, staff, "JOB_RETRIED", { type: "JOB", id, label: `${job.queueName} · ${id}`, orgId: job.orgId, orgName: job.orgName }, reason);
  return job;
}

/* ---------------- Skill mẫu ---------------- */

export function listSkillTemplates(db: AdminScope): SkillTemplate[] {
  actor(db, "VIEW");
  return db.admin.skillTemplates;
}

export function setTemplatePublished(db: AdminScope, id: string, input: unknown): SkillTemplate {
  const staff = actor(db, "PLATFORM");
  const { published, reason } = parse(SetTemplatePublishedInputSchema, input);
  const t = db.admin.skillTemplates.find((x) => x.id === id);
  if (!t) throw new ApiError("NOT_FOUND", "Không tìm thấy skill mẫu", 404);
  if (t.published === published) throw new ApiError("CONFLICT", published ? "Skill này đã được phát hành" : "Skill này chưa phát hành", 409);
  t.published = published;
  t.updatedAt = nowIso();
  log(db, staff, published ? "SKILL_TEMPLATE_PUBLISHED" : "SKILL_TEMPLATE_UNPUBLISHED", { type: "SKILL_TEMPLATE", id, label: `${t.code} v${t.version}` }, reason);
  return t;
}

/* ---------------- Quản trị viên ---------------- */

const STAFF_ROLE_VI: Record<Staff["role"], string> = { SUPER_ADMIN: "Quản trị cấp cao", SUPPORT: "Hỗ trợ", READONLY: "Chỉ xem" };

export function listStaff(db: AdminScope): Staff[] {
  actor(db, "VIEW");
  return db.admin.staff;
}

function staffOf(db: AdminScope, id: string): Staff {
  const s = db.admin.staff.find((x) => x.id === id);
  if (!s) throw new ApiError("NOT_FOUND", "Không tìm thấy quản trị viên", 404);
  return s;
}

/** Luôn phải còn ít nhất một Quản trị cấp cao đang hoạt động, nếu không sẽ không ai sửa được phân quyền. */
function assertNotLastSuperAdmin(db: AdminScope, target: Staff) {
  const others = db.admin.staff.filter((s) => s.id !== target.id && s.role === "SUPER_ADMIN" && s.status === "ACTIVE");
  if (target.role === "SUPER_ADMIN" && target.status === "ACTIVE" && others.length === 0) {
    throw new ApiError("CONFLICT", "Đây là Quản trị cấp cao duy nhất còn hoạt động – thêm người khác trước", 409);
  }
}

export function inviteStaff(db: AdminScope, input: unknown): Staff {
  const staff = actor(db, "STAFF");
  const v = parse(InviteStaffInputSchema, input);
  if (db.admin.staff.some((s) => s.email === v.email)) throw new ApiError("DUPLICATE", "Email này đã là quản trị viên", 409);
  const s: Staff = { id: newId("stf"), name: v.name, email: v.email, role: v.role, status: "INVITED" };
  db.admin.staff.push(s);
  log(db, staff, "STAFF_INVITED", { type: "STAFF", id: s.id, label: s.name }, "Mời quản trị viên mới", `Vai trò ${STAFF_ROLE_VI[v.role]}`);
  return s;
}

export function changeStaffRole(db: AdminScope, id: string, input: unknown): Staff {
  const staff = actor(db, "STAFF");
  const { role, reason } = parse(ChangeStaffRoleInputSchema, input);
  const s = staffOf(db, id);
  if (s.id === staff.id) throw new ApiError("FORBIDDEN", "Không tự đổi vai trò của chính mình", 403);
  if (s.role === role) throw new ApiError("CONFLICT", "Quản trị viên đang giữ đúng vai trò này", 409);
  if (role !== "SUPER_ADMIN") assertNotLastSuperAdmin(db, s);
  const before = s.role;
  s.role = role;
  log(db, staff, "STAFF_ROLE_CHANGED", { type: "STAFF", id, label: s.name }, reason, `${STAFF_ROLE_VI[before]} → ${STAFF_ROLE_VI[role]}`);
  return s;
}

export function setStaffDisabled(db: AdminScope, id: string, disabled: boolean, input: unknown): Staff {
  const staff = actor(db, "STAFF");
  const { reason } = parse(AdminReasonInputSchema, input);
  const s = staffOf(db, id);
  if (s.id === staff.id) throw new ApiError("FORBIDDEN", "Không tự khóa tài khoản của chính mình", 403);
  if (s.status === "INVITED") throw new ApiError("CONFLICT", "Tài khoản chưa kích hoạt nên không khóa/mở được", 409);
  if (disabled === (s.status === "DISABLED")) throw new ApiError("CONFLICT", disabled ? "Tài khoản đã bị khóa" : "Tài khoản đang hoạt động", 409);
  if (disabled) assertNotLastSuperAdmin(db, s);
  s.status = disabled ? "DISABLED" : "ACTIVE";
  log(db, staff, disabled ? "STAFF_DISABLED" : "STAFF_ENABLED", { type: "STAFF", id, label: s.name }, reason);
  return s;
}

/* ---------------- Nhật ký ---------------- */

export function listAudit(db: AdminScope, filter: { orgId?: string } = {}): AdminAuditEntry[] {
  actor(db, "VIEW");
  return db.admin.audit.filter((a) => !filter.orgId || a.orgId === filter.orgId);
}

/* ---------------- Thông báo hệ thống ---------------- */

export function listAnnouncements(db: AdminScope): Announcement[] {
  actor(db, "VIEW");
  return db.admin.announcements;
}

export function sendAnnouncement(db: AdminScope, input: unknown): Announcement {
  const staff = actor(db, "SUPPORT");
  const v = parse(SendAnnouncementInputSchema, input);
  // Doanh nghiệp đang tạm khóa không nhận thông báo.
  const receivers = orgRefs(db).filter((r) => r.meta.status === "ACTIVE" && (v.audience === "ALL" || r.org.plan.code === v.audience));
  if (receivers.length === 0) throw new ApiError("CONFLICT", "Không có doanh nghiệp nào thuộc nhóm nhận đã chọn", 409);
  const a: Announcement = {
    id: newId("ann"),
    title: v.title,
    body: v.body,
    kind: v.kind,
    audience: v.audience,
    ...(v.kind === "MAINTENANCE" && v.maintenanceDate ? { maintenanceDate: v.maintenanceDate } : {}),
    status: "SENT",
    sentAt: nowIso(),
    sentByName: staff.name,
    recipients: receivers.length,
  };
  db.admin.announcements.unshift(a);
  // Doanh nghiệp demo nằm trong nhóm nhận → hiện ngay ở panel Thông báo của ứng dụng khách.
  if (receivers.some((r) => r.org === db.org)) {
    const notificationId = newId("ntf");
    db.notifications.unshift({ id: notificationId, title: a.title, body: a.body, at: a.sentAt, read: false });
    db.admin.announcementNotifications[a.id] = notificationId;
  }
  log(db, staff, "ANNOUNCEMENT_SENT", { type: "ANNOUNCEMENT", id: a.id, label: a.title }, "Gửi thông báo hệ thống", `${receivers.length} doanh nghiệp nhận`);
  return a;
}

export function withdrawAnnouncement(db: AdminScope, id: string, input: unknown): Announcement {
  const staff = actor(db, "SUPPORT");
  const { reason } = parse(AdminReasonInputSchema, input);
  const a = db.admin.announcements.find((x) => x.id === id);
  if (!a) throw new ApiError("NOT_FOUND", "Không tìm thấy thông báo", 404);
  if (a.status === "WITHDRAWN") throw new ApiError("CONFLICT", "Thông báo này đã được thu hồi", 409);
  a.status = "WITHDRAWN";
  const notificationId = db.admin.announcementNotifications[id];
  if (notificationId) {
    db.notifications = db.notifications.filter((n) => n.id !== notificationId);
    delete db.admin.announcementNotifications[id];
  }
  log(db, staff, "ANNOUNCEMENT_WITHDRAWN", { type: "ANNOUNCEMENT", id, label: a.title }, reason);
  return a;
}

/* ---------------- Tổng quan ---------------- */

/** Ngưỡng cảnh báo trên màn tổng quan. */
const QUOTA_WARN = 0.9;
const EXPIRING_DAYS = 7;
const JOIN_STALE_DAYS = 3;

export function getOverview(db: AdminScope): AdminOverview {
  actor(db, "VIEW");
  const users = allUsers(db);
  const orgs = orgRefs(db).map((r) => toAdminOrg(r, users));
  const active = orgs.filter((o) => o.status === "ACTIVE");
  const attention: AttentionItem[] = [];

  for (const o of active) {
    const limit = o.plan.dossiersPerMonth + o.quotaBonus;
    const ratio = limit > 0 ? o.usage.dossiersThisMonth / limit : 0;
    if (ratio >= QUOTA_WARN) {
      attention.push({
        id: `quota_${o.id}`,
        kind: "QUOTA",
        severity: ratio >= 1 ? "danger" : "warning",
        title: ratio >= 1 ? `${o.name} đã hết hạn mức` : `${o.name} sắp hết hạn mức`,
        detail: `${o.usage.dossiersThisMonth}/${limit} hồ sơ tháng này · gói ${o.plan.name}`,
        href: `/admin/orgs/${o.id}?tab=plan`,
      });
    }
    const days = daysUntil(o.plan.renewsAt);
    if (days <= EXPIRING_DAYS) {
      const trial = o.plan.code === "TRIAL";
      attention.push({
        id: `expiring_${o.id}`,
        kind: "PLAN_EXPIRING",
        severity: days < 0 ? "danger" : "warning",
        title: `${o.name}: ${trial ? "dùng thử" : "gói"} ${days < 0 ? `đã hết hạn ${-days} ngày` : days === 0 ? "hết hạn hôm nay" : `hết hạn sau ${days} ngày`}`,
        detail: trial ? "Liên hệ chuyển sang gói trả phí hoặc gia hạn dùng thử." : `Gói ${o.plan.name} tới kỳ gia hạn.`,
        href: `/admin/orgs/${o.id}?tab=plan`,
      });
    }
  }
  for (const it of db.admin.integrations) {
    if (it.status === "ERROR") {
      attention.push({ id: `integration_${it.id}`, kind: "INTEGRATION_ERROR", severity: "danger", title: `${it.name} đang lỗi`, detail: it.detail ?? "Kiểm tra kết nối.", href: "/admin/integrations" });
    }
  }
  if (db.admin.failedJobs.length > 0) {
    attention.push({ id: "jobs_failed", kind: "JOBS_FAILED", severity: "warning", title: `${db.admin.failedJobs.length} job lỗi chờ xử lý`, detail: "Xem nguyên nhân và chạy lại ở màn Sức khỏe hệ thống.", href: "/admin/system" });
  }
  const stale = users.filter((u) => u.status === "PENDING_JOIN" && u.joinRequestedAt && Date.now() - new Date(u.joinRequestedAt).getTime() > JOIN_STALE_DAYS * DAY);
  if (stale.length > 0) {
    attention.push({ id: "join_pending", kind: "JOIN_PENDING", severity: "warning", title: `${stale.length} yêu cầu tham gia chờ quá ${JOIN_STALE_DAYS} ngày`, detail: "Chủ doanh nghiệp chưa duyệt – nhắc họ hoặc liên hệ người đăng ký.", href: "/admin/users?view=pending" });
  }

  return {
    orgs: { active: active.length, suspended: orgs.length - active.length, new30d: orgs.filter((o) => Date.now() - new Date(o.createdAt).getTime() <= 30 * DAY).length },
    users: { total: users.length, active7d: users.filter((u) => u.lastActiveAt && Date.now() - new Date(u.lastActiveAt).getTime() <= 7 * DAY).length },
    dossiersThisMonth: orgs.reduce((n, o) => n + o.usage.dossiersThisMonth, 0),
    aiCostVnd: fromMinor(sumMinor(orgs.map((o) => toMinor(o.usage.aiCostVnd, 0))), 0),
    // Đỏ trước, vàng sau.
    attention: attention.sort((a, b) => Number(b.severity === "danger") - Number(a.severity === "danger")),
    recentOrgs: [...orgs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
  };
}
