import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { plans } from "./plans.js";
import { appRole, currentOrg, currentUser, id, noContext, orgId, orgPolicyUsing, orgRls, timestamps } from "./shared.js";

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    taxCode: text("tax_code").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    phone: text("phone").notNull().default(""),
    /** Mã bưu chính của doanh nghiệp (6 số VN) – chỉ tiêu 1.14 IDA (TK_IMY) / 2.13 EDA (TK_EPP); "" = chưa khai. */
    postalCode: text("postal_code").notNull().default(""),
    planCode: text("plan_code")
      .notNull()
      .references(() => plans.code),
    suspectThreshold: text("suspect_threshold").notNull().default("BALANCED"),
    /** Nguyên tắc 4 mắt: người duyệt tờ khai phải khác người tạo hồ sơ. */
    fourEyes: boolean("four_eyes").notNull().default(false),
    /** ACTIVE | SUSPENDED – đội vận hành tạm khóa: không đăng nhập, phiên cũ hết hiệu lực. */
    status: text("status").notNull().default("ACTIVE"),
    suspendedReason: text("suspended_reason"),
    /** Số hồ sơ nới thêm cho đúng tháng `quota_bonus_month` (YYYY-MM, giờ VN) – sang tháng khác tự hết. */
    quotaBonus: integer("quota_bonus").notNull().default(0),
    quotaBonusMonth: text("quota_bonus_month"),
    /** Mốc tính kỳ 30 ngày của gói (đổi gói → kỳ mới); null = ngày tạo doanh nghiệp. */
    planStartedAt: timestamp("plan_started_at", { withTimezone: true }),
    /** Hết hạn dùng thử (gói TRIAL) khi được gia hạn; null = theo kỳ 30 ngày. */
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("organizations_tax_code_uq").on(t.taxCode),
    // Đọc: org đang đặt, hoặc org mình là thành viên (withUser), hoặc không ngữ cảnh (identity tra MST khi đăng ký).
    pgPolicy("organizations_read", {
      for: "select",
      to: appRole,
      using: sql`id = ${currentOrg} OR id IN (select org_id from memberships where user_id = ${currentUser}) OR (${noContext})`,
    }),
    // Tạo org: chỉ identity (withSystem). Sửa: chỉ org đang đặt.
    pgPolicy("organizations_insert", { for: "insert", to: appRole, withCheck: sql`${noContext}` }),
    pgPolicy("organizations_update", { for: "update", to: appRole, using: sql`id = ${currentOrg}`, withCheck: sql`id = ${currentOrg}` }),
  ],
).enableRLS();

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    // Đọc: chính mình, thành viên cùng org đang đặt, hoặc không ngữ cảnh (identity tìm theo email khi đăng nhập).
    pgPolicy("users_read", {
      for: "select",
      to: appRole,
      using: sql`id = ${currentUser} OR id IN (select user_id from memberships where org_id = ${currentOrg}) OR id IN (select user_id from join_requests where org_id = ${currentOrg} and status = 'PENDING') OR (${noContext})`,
    }),
    // Tạo user: chỉ identity (withSystem). Sửa: chỉ chính mình.
    pgPolicy("users_insert", { for: "insert", to: appRole, withCheck: sql`${noContext}` }),
    pgPolicy("users_update", { for: "update", to: appRole, using: sql`id = ${currentUser}`, withCheck: sql`id = ${currentUser}` }),
  ],
).enableRLS();

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    invitedBy: text("invited_by"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId),
    index("memberships_user_idx").on(t.userId),
    // Đọc/ghi dòng của org đang đặt; riêng khi CHƯA có org (withUser) được đọc dòng của chính mình để liệt kê org sau đăng nhập.
    // Ghi khi không có ngữ cảnh (withSystem): chỉ đăng ký – tạo doanh nghiệp + membership OWNER trong CÙNG transaction (không để org mồ côi).
    pgPolicy("memberships_rls", {
      for: "all",
      to: appRole,
      using: sql`${orgPolicyUsing} OR (coalesce(${currentOrg}, '') = '' AND user_id = ${currentUser})`,
      withCheck: sql`${orgPolicyUsing} OR (${noContext})`,
    }),
  ],
).enableRLS();

/** Phiên đăng nhập: DB chỉ giữ sha256(token). org_id = doanh nghiệp đang làm việc (null khi chưa có). */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    orgId: text("org_id"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** Phiên đã qua bước xác thực 2 lớp (chỉ khu Quản trị hệ thống dùng – ADR 0006). */
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    pgPolicy("sessions_rw", {
      for: "all",
      to: appRole,
      using: sql`(${noContext}) OR user_id = ${currentUser}`,
      withCheck: sql`(${noContext}) OR user_id = ${currentUser}`,
    }),
  ],
).enableRLS();

/** Token một lần: xác thực email, đặt lại mật khẩu, lời mời. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    orgId: text("org_id"),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_tokens_hash_uq").on(t.tokenHash),
    index("auth_tokens_user_idx").on(t.userId),
    pgPolicy("auth_tokens_rw", {
      for: "all",
      to: appRole,
      using: sql`(${noContext}) OR user_id = ${currentUser}`,
      withCheck: sql`(${noContext}) OR user_id = ${currentUser}`,
    }),
  ],
).enableRLS();

/** Yêu cầu tham gia doanh nghiệp đã có (đăng ký với MST trùng). */
export const joinRequests = pgTable(
  "join_requests",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("PENDING"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("join_requests_org_idx").on(t.orgId),
    index("join_requests_user_idx").on(t.userId),
    pgPolicy("join_requests_read", { for: "select", to: appRole, using: sql`${orgPolicyUsing} OR user_id = ${currentUser} OR (${noContext})` }),
    pgPolicy("join_requests_insert", { for: "insert", to: appRole, withCheck: sql`(${noContext}) OR user_id = ${currentUser}` }),
    pgPolicy("join_requests_update", { for: "update", to: appRole, using: orgPolicyUsing, withCheck: orgPolicyUsing }),
  ],
).enableRLS();

/** Chứng thư số: chỉ metadata (ký số do phía FPT/VNACCS, xem docs/BACKEND-TODO.md T5). */
export const digitalCertificates = pgTable(
  "digital_certificates",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    subject: text("subject").notNull(),
    issuer: text("issuer").notNull(),
    serial: text("serial").notNull(),
    validTo: date("valid_to").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("digital_certificates_org_idx").on(t.orgId), orgRls("digital_certificates_rls")],
).enableRLS();

/** Bí mật của doanh nghiệp (tài khoản VNACCS, khóa API…) mã hóa AES-256-GCM; không bao giờ trả về API. */
export const orgSecrets = pgTable(
  "org_secrets",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    kind: text("kind").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    ...timestamps(),
  },
  (t) => [uniqueIndex("org_secrets_org_kind_uq").on(t.orgId, t.kind), orgRls("org_secrets_rls")],
).enableRLS();

/** Thông báo trong ứng dụng cho một người dùng trong một doanh nghiệp. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    /** Bản sao của thông báo hệ thống – thu hồi thì xóa theo cột này. */
    announcementId: text("announcement_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_org_user_idx").on(t.orgId, t.userId, t.createdAt),
    // Đếm/đánh dấu "chưa đọc" – chỉ số nhỏ, bỏ qua dòng đã đọc.
    index("notifications_unread_idx").on(t.orgId, t.userId).where(sql`read_at is null`),
    pgPolicy("notifications_rls", {
      for: "all",
      to: appRole,
      using: sql`${orgPolicyUsing} AND user_id = ${currentUser}`,
      withCheck: orgPolicyUsing,
    }),
  ],
).enableRLS();
