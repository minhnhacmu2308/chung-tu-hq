// Bảng của khu Quản trị hệ thống (ADR 0006). Bật RLS nhưng KHÔNG có policy cho kb_app → ứng dụng của khách không đọc/ghi được;
// chỉ vai trò kb_platform (BYPASSRLS) của module admin truy cập.
import { bigint, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./identity.js";
import { id, timestamps } from "./shared.js";

/** Tài khoản đội vận hành: một tài khoản người dùng + vai trò quản trị hệ thống (không phải vai trò trong doanh nghiệp). */
export const platformStaff = pgTable("platform_staff", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  role: text("role").notNull(),
  /** ACTIVE | INVITED (chưa đăng nhập lần nào) | DISABLED */
  status: text("status").notNull().default("INVITED"),
  invitedBy: text("invited_by"),
  /** 2FA (TOTP): khóa mã hóa bằng APP_MASTER_KEY. `pending` = đang thiết lập, chưa xác nhận mã đầu tiên. */
  totpCiphertext: text("totp_ciphertext"),
  totpPendingCiphertext: text("totp_pending_ciphertext"),
  totpKeyVersion: integer("totp_key_version").notNull().default(1),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** Bộ đếm TOTP đã dùng gần nhất – chống dùng lại cùng một mã. */
  totpLastCounter: bigint("totp_last_counter", { mode: "number" }),
  /** Hash sha256 của các mã khôi phục chưa dùng. */
  recoveryCodes: jsonb("recovery_codes").$type<string[]>().notNull().default([]),
  ...timestamps(),
}).enableRLS();

/** Nhật ký quản trị – append-only, ghi cùng transaction với thao tác. */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: id(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    staffId: text("staff_id").notNull(),
    staffName: text("staff_name").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetLabel: text("target_label").notNull(),
    orgId: text("org_id"),
    orgName: text("org_name"),
    reason: text("reason").notNull(),
    detail: text("detail"),
  },
  (t) => [index("admin_audit_at_idx").on(t.at), index("admin_audit_org_at_idx").on(t.orgId, t.at), index("admin_audit_target_idx").on(t.targetType, t.targetId, t.at)],
).enableRLS();

/** Thông báo hệ thống gửi tới nhiều doanh nghiệp; bản sao trong `notifications` mang announcement_id để thu hồi. */
export const announcements = pgTable("announcements", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(),
  /** "ALL" hoặc mã gói. */
  audience: text("audience").notNull(),
  maintenanceDate: text("maintenance_date"),
  status: text("status").notNull().default("SENT"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sentBy: text("sent_by").notNull(),
  sentByName: text("sent_by_name").notNull(),
  recipients: integer("recipients").notNull().default(0),
}).enableRLS();

/** Khóa API dùng chung của nền tảng (hscodepro, Customs Hub, AI, HĐĐT). Khóa mã hóa bằng APP_MASTER_KEY; API chỉ trả 4 ký tự cuối. */
export const platformIntegrations = pgTable("platform_integrations", {
  id: text("id").primaryKey(),
  environment: text("environment").notNull().default("SANDBOX"),
  ciphertext: text("ciphertext"),
  keyVersion: integer("key_version").notNull().default(1),
  keyLast4: text("key_last4"),
  keyUpdatedAt: timestamp("key_updated_at", { withTimezone: true }),
  status: text("status").notNull().default("NOT_CONFIGURED"),
  detail: text("detail"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  ...timestamps(),
}).enableRLS();
