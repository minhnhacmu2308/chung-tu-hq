// Back-office của bên vận hành KhaiBáo AI (màn /admin). Nhìn xuyên doanh nghiệp nhưng CHỈ số liệu tổng hợp:
// không schema nào ở đây chứa nội dung hồ sơ, chứng từ hay tờ khai của khách.
import { z } from "zod";
import { DecimalStringSchema, DocKindSchema, IsoDateSchema, IsoDateTimeSchema, RoleSchema } from "../common.js";
import { IntegrationIdSchema, PlanCodeSchema } from "./identity.js";
import { SkillKindSchema } from "./skill.js";

/* ---------------- Quản trị viên & quyền ---------------- */

export const StaffRoleSchema = z.enum(["SUPER_ADMIN", "SUPPORT", "READONLY"]);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

/**
 * VIEW: xem mọi màn · SUPPORT: thao tác hỗ trợ khách (khóa/mở, đặt lại mật khẩu, chạy lại job, thông báo)
 * BILLING: gói, hạn mức · PLATFORM: khóa API tích hợp, skill mẫu · STAFF: quản lý quản trị viên.
 */
export const AdminPermissionSchema = z.enum(["VIEW", "SUPPORT", "BILLING", "PLATFORM", "STAFF"]);
export type AdminPermission = z.infer<typeof AdminPermissionSchema>;

/** Nguồn duy nhất của bảng quyền – FE dùng để ẩn thao tác, backend dùng để chặn. */
export const STAFF_PERMISSIONS: Record<StaffRole, readonly AdminPermission[]> = {
  SUPER_ADMIN: ["VIEW", "SUPPORT", "BILLING", "PLATFORM", "STAFF"],
  SUPPORT: ["VIEW", "SUPPORT"],
  READONLY: ["VIEW"],
};

export const staffCan = (role: StaffRole, permission: AdminPermission): boolean => STAFF_PERMISSIONS[role].includes(permission);

export const AccountStatusSchema = z.enum(["ACTIVE", "INVITED", "DISABLED"]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const StaffSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: StaffRoleSchema,
  status: AccountStatusSchema,
  lastActiveAt: IsoDateTimeSchema.optional(),
  /** Đã bật xác thực 2 lớp (ứng dụng xác thực). */
  mfaEnabled: z.boolean().optional(),
});
export type Staff = z.infer<typeof StaffSchema>;

/**
 * `mfa`: trạng thái xác thực 2 lớp của phiên – `enrolled` đã thiết lập ứng dụng xác thực, `verified` phiên này đã nhập mã.
 * Chưa `verified` thì mọi API quản trị trả MFA_REQUIRED; màn hình hiện bước thiết lập / nhập mã. Bản mock luôn verified.
 */
export const AdminMfaStateSchema = z.object({ enrolled: z.boolean(), verified: z.boolean() });
export type AdminMfaState = z.infer<typeof AdminMfaStateSchema>;
export const AdminSessionSchema = z.object({ staff: StaffSchema, mfa: AdminMfaStateSchema.optional() });
export type AdminSession = z.infer<typeof AdminSessionSchema>;

/* ---------------- Doanh nghiệp ---------------- */

export const OrgStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);
export type OrgStatus = z.infer<typeof OrgStatusSchema>;

export const AdminOrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** MST – string. */
  taxCode: z.string(),
  status: OrgStatusSchema,
  suspendedReason: z.string().optional(),
  plan: z.object({
    code: PlanCodeSchema,
    name: z.string(),
    dossiersPerMonth: z.number().int().nonnegative(),
    pagesPerDossier: z.number().int().nonnegative(),
    renewsAt: IsoDateSchema,
  }),
  /** Số hồ sơ được cộng thêm vào hạn mức của tháng này (nới tạm, tự hết khi sang kỳ). */
  quotaBonus: z.number().int().nonnegative(),
  usage: z.object({ dossiersThisMonth: z.number().int().nonnegative(), pagesThisMonth: z.number().int().nonnegative(), aiCostVnd: DecimalStringSchema }),
  memberCount: z.number().int().nonnegative(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  createdAt: IsoDateTimeSchema,
  lastActiveAt: IsoDateTimeSchema.optional(),
});
export type AdminOrg = z.infer<typeof AdminOrgSchema>;

export const IntegrationStatusSchema = z.enum(["CONNECTED", "ERROR", "NOT_CONFIGURED"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const AdminOrgDetailSchema = AdminOrgSchema.extend({
  address: z.string(),
  phone: z.string(),
  /** Chỉ trạng thái kết nối – không có khóa, không có nội dung thông điệp. */
  integrations: z.array(z.object({ id: IntegrationIdSchema, name: z.string(), status: IntegrationStatusSchema })),
  certificates: z.array(z.object({ id: z.string(), issuer: z.string(), validTo: IsoDateSchema, isDefault: z.boolean() })),
});
export type AdminOrgDetail = z.infer<typeof AdminOrgDetailSchema>;

/* ---------------- Người dùng toàn hệ thống ---------------- */

/** PENDING_JOIN: đã đăng ký theo MST đã có, đang chờ Owner của doanh nghiệp duyệt (ADR 0004). */
export const AdminUserStatusSchema = z.enum(["ACTIVE", "INVITED", "DISABLED", "PENDING_JOIN"]);
export type AdminUserStatus = z.infer<typeof AdminUserStatusSchema>;

export const AdminUserSessionSchema = z.object({ id: z.string(), device: z.string(), ip: z.string(), lastSeenAt: IsoDateTimeSchema });
export type AdminUserSession = z.infer<typeof AdminUserSessionSchema>;

export const AdminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  orgId: z.string(),
  orgName: z.string(),
  role: RoleSchema,
  status: AdminUserStatusSchema,
  emailVerified: z.boolean(),
  createdAt: IsoDateTimeSchema,
  lastActiveAt: IsoDateTimeSchema.optional(),
  joinRequestedAt: IsoDateTimeSchema.optional(),
  sessions: z.array(AdminUserSessionSchema),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/* ---------------- Gói dịch vụ & sử dụng ---------------- */

export const AdminPlanSchema = z.object({
  code: PlanCodeSchema,
  name: z.string(),
  dossiersPerMonth: z.number().int().nonnegative(),
  pagesPerDossier: z.number().int().nonnegative(),
  priceVnd: DecimalStringSchema,
  /** Giá theo hợp đồng riêng (gói Doanh nghiệp) – `priceVnd` chỉ là giá tham chiếu. */
  customPricing: z.boolean(),
  orgCount: z.number().int().nonnegative(),
});
export type AdminPlan = z.infer<typeof AdminPlanSchema>;

/** Tháng báo cáo "YYYY-MM". */
export const UsageMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải dạng YYYY-MM");
export type UsageMonth = z.infer<typeof UsageMonthSchema>;

export const OrgUsageRowSchema = z.object({
  orgId: z.string(),
  orgName: z.string(),
  planCode: PlanCodeSchema,
  planName: z.string(),
  dossiers: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
  aiCalls: z.number().int().nonnegative(),
  /** Giá vốn theo loại lệnh gọi trả phí (từ usage_events). */
  readCostVnd: DecimalStringSchema,
  hsCostVnd: DecimalStringSchema,
  customsCostVnd: DecimalStringSchema,
  totalCostVnd: DecimalStringSchema,
  planPriceVnd: DecimalStringSchema,
  /** Giá gói − giá vốn; âm = đang lỗ trên doanh nghiệp này. */
  marginVnd: DecimalStringSchema,
});
export type OrgUsageRow = z.infer<typeof OrgUsageRowSchema>;

export const UsageReportSchema = z.object({
  month: UsageMonthSchema,
  rows: z.array(OrgUsageRowSchema),
  totals: z.object({
    dossiers: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
    aiCalls: z.number().int().nonnegative(),
    totalCostVnd: DecimalStringSchema,
    revenueVnd: DecimalStringSchema,
    marginVnd: DecimalStringSchema,
  }),
});
export type UsageReport = z.infer<typeof UsageReportSchema>;

/* ---------------- Tích hợp dùng chung ---------------- */

export const PlatformIntegrationSchema = z.object({
  id: IntegrationIdSchema,
  name: z.string(),
  description: z.string(),
  status: IntegrationStatusSchema,
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  /** Chỉ 4 ký tự cuối của khóa – khóa đầy đủ nằm trong kho bí mật, không bao giờ xuống trình duyệt. */
  keyLast4: z.string().length(4).optional(),
  keyUpdatedAt: IsoDateTimeSchema.optional(),
  lastCheckedAt: IsoDateTimeSchema.optional(),
  detail: z.string().optional(),
  orgCount: z.number().int().nonnegative(),
});
export type PlatformIntegration = z.infer<typeof PlatformIntegrationSchema>;

/* ---------------- Sức khỏe hệ thống ---------------- */

export const ServiceStatusSchema = z.enum(["UP", "DEGRADED", "DOWN"]);
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const ServiceHealthSchema = z.object({
  id: z.enum(["POSTGRES", "REDIS", "STORAGE", "WORKER"]),
  name: z.string(),
  status: ServiceStatusSchema,
  detail: z.string(),
  checkedAt: IsoDateTimeSchema,
});
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;

export const QueueStatSchema = z.object({
  id: z.string(),
  name: z.string(),
  waiting: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  completedToday: z.number().int().nonnegative(),
});
export type QueueStat = z.infer<typeof QueueStatSchema>;

export const FailedJobSchema = z.object({
  id: z.string(),
  queueId: z.string(),
  queueName: z.string(),
  /** Loại việc, vd "Đọc chứng từ" – không kèm tên file hay nội dung. */
  kind: z.string(),
  orgId: z.string(),
  orgName: z.string(),
  error: z.string(),
  attempts: z.number().int().positive(),
  failedAt: IsoDateTimeSchema,
});
export type FailedJob = z.infer<typeof FailedJobSchema>;

export const SystemHealthSchema = z.object({
  services: z.array(ServiceHealthSchema),
  queues: z.array(QueueStatSchema),
  failedJobs: z.array(FailedJobSchema),
});
export type SystemHealth = z.infer<typeof SystemHealthSchema>;

/* ---------------- Skill mẫu ---------------- */

export const SkillTemplateSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: SkillKindSchema,
  docKind: DocKindSchema.optional(),
  version: z.number().int().nonnegative(),
  fieldCount: z.number().int().nonnegative(),
  /** Đã phát hành: doanh nghiệp mới được cấp sẵn skill này. */
  published: z.boolean(),
  orgCount: z.number().int().nonnegative(),
  updatedAt: IsoDateTimeSchema,
});
export type SkillTemplate = z.infer<typeof SkillTemplateSchema>;

/* ---------------- Nhật ký quản trị ---------------- */

export const AdminActionSchema = z.enum([
  "ORG_SUSPENDED",
  "ORG_REACTIVATED",
  "ORG_PLAN_CHANGED",
  "ORG_QUOTA_ADJUSTED",
  "ORG_TRIAL_EXTENDED",
  "USER_DISABLED",
  "USER_ENABLED",
  "USER_PASSWORD_RESET_SENT",
  "USER_VERIFICATION_RESENT",
  "USER_SESSIONS_REVOKED",
  "PLAN_UPDATED",
  "INTEGRATION_KEY_UPDATED",
  "JOB_RETRIED",
  "SKILL_TEMPLATE_PUBLISHED",
  "SKILL_TEMPLATE_UNPUBLISHED",
  "STAFF_INVITED",
  "STAFF_ROLE_CHANGED",
  "STAFF_DISABLED",
  "STAFF_ENABLED",
  "STAFF_MFA_ENABLED",
  "STAFF_MFA_RESET",
  "ANNOUNCEMENT_SENT",
  "ANNOUNCEMENT_WITHDRAWN",
  "EXCHANGE_RATE_UPDATED",
]);
export type AdminAction = z.infer<typeof AdminActionSchema>;

export const AdminTargetTypeSchema = z.enum(["ORG", "USER", "PLAN", "INTEGRATION", "JOB", "SKILL_TEMPLATE", "STAFF", "ANNOUNCEMENT", "EXCHANGE_RATE"]);
export type AdminTargetType = z.infer<typeof AdminTargetTypeSchema>;

/** Append-only: không có API sửa/xóa. */
export const AdminAuditEntrySchema = z.object({
  id: z.string(),
  at: IsoDateTimeSchema,
  staffId: z.string(),
  staffName: z.string(),
  action: AdminActionSchema,
  targetType: AdminTargetTypeSchema,
  targetId: z.string(),
  targetLabel: z.string(),
  orgId: z.string().optional(),
  orgName: z.string().optional(),
  reason: z.string(),
  /** Thay đổi cụ thể, vd "Cơ bản → Chuyên nghiệp". */
  detail: z.string().optional(),
});
export type AdminAuditEntry = z.infer<typeof AdminAuditEntrySchema>;

/* ---------------- Thông báo hệ thống ---------------- */

export const AnnouncementKindSchema = z.enum(["INFO", "MAINTENANCE"]);
export type AnnouncementKind = z.infer<typeof AnnouncementKindSchema>;

/** Gửi mọi doanh nghiệp hoặc chỉ doanh nghiệp đang dùng một gói. */
export const AnnouncementAudienceSchema = z.union([z.literal("ALL"), PlanCodeSchema]);
export type AnnouncementAudience = z.infer<typeof AnnouncementAudienceSchema>;

export const AnnouncementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  kind: AnnouncementKindSchema,
  audience: AnnouncementAudienceSchema,
  /** Ngày bảo trì (chỉ với kind = MAINTENANCE). */
  maintenanceDate: IsoDateSchema.optional(),
  status: z.enum(["SENT", "WITHDRAWN"]),
  sentAt: IsoDateTimeSchema,
  sentByName: z.string(),
  /** Số doanh nghiệp nhận. */
  recipients: z.number().int().nonnegative(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

/* ---------------- Tổng quan vận hành ---------------- */

export const AttentionKindSchema = z.enum(["QUOTA", "PLAN_EXPIRING", "INTEGRATION_ERROR", "JOBS_FAILED", "JOIN_PENDING", "RATE_FETCH"]);
export type AttentionKind = z.infer<typeof AttentionKindSchema>;

export const AttentionItemSchema = z.object({
  id: z.string(),
  kind: AttentionKindSchema,
  severity: z.enum(["warning", "danger"]),
  title: z.string(),
  detail: z.string(),
  /** Màn back-office để xử lý. */
  href: z.string(),
});
export type AttentionItem = z.infer<typeof AttentionItemSchema>;

export const AdminOverviewSchema = z.object({
  orgs: z.object({ active: z.number().int().nonnegative(), suspended: z.number().int().nonnegative(), new30d: z.number().int().nonnegative() }),
  users: z.object({ total: z.number().int().nonnegative(), active7d: z.number().int().nonnegative() }),
  dossiersThisMonth: z.number().int().nonnegative(),
  aiCostVnd: DecimalStringSchema,
  attention: z.array(AttentionItemSchema),
  recentOrgs: z.array(AdminOrgSchema),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;
