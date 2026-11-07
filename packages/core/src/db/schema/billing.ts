import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./identity.js";
import { appRole, id, money, noContext, orgId, orgPolicyUsing, orgRls, timestamps } from "./shared.js";

/** Mọi lần gọi AI / API trả phí bên thứ 3 (B8). */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id"),
    documentId: text("document_id"),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: money("cost_usd").notNull().default("0"),
    costVnd: money("cost_vnd").notNull().default("0"),
    meta: jsonb("meta"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_events_org_at_idx").on(t.orgId, t.at), orgRls("usage_events_rls")],
).enableRLS();

/**
 * Hợp đồng năm (gói CONTRACT, ADR 0011): số hợp đồng, hiệu lực, giá trị (báo cáo doanh thu), ghi chú nội bộ.
 * Khu Quản trị ghi (kb_platform). Ứng dụng (kb_app) chỉ ĐỌC dòng của org đang đặt – để tính tình trạng hợp đồng và chặn khai khi hết hạn.
 */
export const orgContracts = pgTable(
  "org_contracts",
  {
    orgId: text("org_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contractNo: text("contract_no"),
    /** Ngày bắt đầu hiệu lực, YYYY-MM-DD. */
    startsOn: date("starts_on", { mode: "string" }),
    /** Ngày hết hạn hợp đồng, YYYY-MM-DD; null = chưa có (khai không giới hạn, khu Quản trị nhắc nhập). */
    endsOn: date("ends_on", { mode: "string" }),
    /** Giá trị hợp đồng (VND) – doanh thu ghi nhận = value/12 mỗi tháng hợp đồng phủ. */
    valueVnd: money("value_vnd").notNull().default("0"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    ...timestamps(),
  },
  () => [pgPolicy("org_contracts_read", { for: "select", to: appRole, using: orgPolicyUsing })],
).enableRLS();

/**
 * Sổ lượt append-only (ADR 0011). Số dư = sum(delta) theo org – không có cột số dư. `id` là khóa chống trùng (ghi `on conflict do nothing`):
 * `charge:<orgId>:<declarationNo>`, `payos:<orderCode>`, `grant:signup:<orgId>`, `grant:migrate:<orgId>`, `adj:<ulid>`…
 * Ứng dụng chỉ đọc + thêm dòng của org đang đặt (không sửa/xóa).
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    /** Lượt cộng (+) / trừ (−). CONTRACT_USE = 0 (chỉ đếm). */
    delta: integer("delta").notNull(),
    /** PURCHASE | MANUAL_TOPUP | GRANT | CHARGE | CONTRACT_USE | REFUND | ADJUST */
    reason: text("reason").notNull(),
    /** PURCHASE = tiền thu; CHARGE = delta × đơn giá lúc trừ (doanh thu ghi nhận); GRANT/CONTRACT_USE = 0. */
    amountVnd: money("amount_vnd").notNull().default("0"),
    unitPriceVnd: money("unit_price_vnd").notNull().default("0"),
    dossierId: text("dossier_id"),
    branch: integer("branch"),
    /** Số tờ khai – string (bất biến 2). */
    declarationNo: text("declaration_no"),
    paymentId: text("payment_id"),
    /** Lý do của quản trị (bắt buộc với MANUAL_TOPUP/ADJUST/REFUND). */
    note: text("note"),
    /** user id / staff id; `system` khi tự động. */
    createdBy: text("created_by").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_ledger_org_at_idx").on(t.orgId, t.at),
    check("credit_ledger_reason_chk", sql`reason in ('PURCHASE', 'MANUAL_TOPUP', 'GRANT', 'CHARGE', 'CONTRACT_USE', 'REFUND', 'ADJUST')`),
    pgPolicy("credit_ledger_read", { for: "select", to: appRole, using: orgPolicyUsing }),
    pgPolicy("credit_ledger_insert", { for: "insert", to: appRole, withCheck: orgPolicyUsing }),
  ],
).enableRLS();

/**
 * Thanh toán mua lượt qua PayOS. `raw`: dữ liệu webhook / tra cứu – KHÔNG chứa khóa bí mật.
 * Webhook PayOS không có ngữ cảnh org → được đọc khi không có ngữ cảnh (withSystem) để tìm theo `order_code`; ghi chỉ trong ngữ cảnh org.
 */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("PAYOS"),
    orderCode: bigint("order_code", { mode: "number" }).notNull(),
    credits: integer("credits").notNull(),
    amountVnd: money("amount_vnd").notNull(),
    /** PENDING | PAID | CANCELLED | EXPIRED */
    status: text("status").notNull().default("PENDING"),
    checkoutUrl: text("checkout_url"),
    paymentLinkId: text("payment_link_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    raw: jsonb("raw"),
  },
  (t) => [
    uniqueIndex("payments_order_code_uq").on(t.orderCode),
    index("payments_org_created_idx").on(t.orgId, t.createdAt),
    index("payments_status_idx").on(t.status, t.createdAt),
    check("payments_status_chk", sql`status in ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED')`),
    orgRls("payments_rls"),
    pgPolicy("payments_lookup", { for: "select", to: appRole, using: noContext }),
  ],
).enableRLS();
