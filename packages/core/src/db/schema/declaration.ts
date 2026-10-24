import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgPolicy, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dossiers } from "./dossier.js";
import { appRole, id, money, orgId, orgRls, timestamps } from "./shared.js";

/** Dòng hàng của hồ sơ (từ shipment.items) + HS gợi ý/xác nhận + thuế suất áp dụng. */
export const lineItems = pgTable(
  "line_items",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    description: text("description").notNull(),
    quantity: money("quantity").notNull(),
    unit: text("unit").notNull(),
    unitPrice: money("unit_price").notNull(),
    amount: money("amount").notNull(),
    origin: text("origin").notNull().default(""),
    invoiceHsCode: text("invoice_hs_code"),
    hsSuggested: text("hs_suggested"),
    hsConfidence: real("hs_confidence"),
    hsConfirmed: text("hs_confirmed"),
    hsConfirmedBy: text("hs_confirmed_by"),
    hsConfirmedAt: timestamp("hs_confirmed_at", { withTimezone: true }),
    importDutyRate: money("import_duty_rate"),
    vatRate: money("vat_rate"),
    policyNote: text("policy_note"),
    /** Phân loại HSCodePro: lượt (hs_jobs.id), id dòng phía HSCodePro, trạng thái, câu hỏi chờ trả lời, lỗi, chi tiết (lý do, căn cứ, cảnh báo). */
    hsJobId: text("hs_job_id"),
    hsItemId: text("hs_item_id"),
    hsStatus: text("hs_status").notNull().default("idle"),
    hsQuestion: jsonb("hs_question"),
    hsError: jsonb("hs_error"),
    hsDetail: jsonb("hs_detail"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("line_items_dossier_line_uq").on(t.dossierId, t.lineNo),
    index("line_items_org_dossier_idx").on(t.orgId, t.dossierId),
    // hs-poll / hs-answer tra dòng theo lượt và mục HSCodePro.
    index("line_items_hs_job_idx").on(t.orgId, t.hsJobId),
    index("line_items_hs_item_idx").on(t.orgId, t.hsItemId),
    orgRls("line_items_rls"),
  ],
).enableRLS();

/** Gợi ý HS từ classifier cho một dòng hàng (nhiều ứng viên). */
export const hsSuggestions = pgTable(
  "hs_suggestions",
  {
    id: id(),
    orgId: orgId(),
    lineItemId: text("line_item_id")
      .notNull()
      .references(() => lineItems.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description").notNull().default(""),
    confidence: real("confidence").notNull(),
    rates: jsonb("rates"),
    /** Vì sao HSCodePro không chọn mã thay thế này. */
    whyNot: text("why_not"),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hs_suggestions_item_idx").on(t.lineItemId), orgRls("hs_suggestions_rls")],
).enableRLS();

/** Lượt phân loại HSCodePro (≤ 50 dòng). `external_id` = id lượt phía HSCodePro; `polls` = số lần đã hỏi trạng thái. */
export const hsJobs = pgTable(
  "hs_jobs",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    status: text("status").notNull(),
    polls: integer("polls").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("hs_jobs_org_dossier_idx").on(t.orgId, t.dossierId), check("hs_jobs_status_chk", sql`status in ('pending', 'processing', 'need_info', 'completed', 'cancelled')`), orgRls("hs_jobs_rls")],
).enableRLS();

/** Tờ khai nháp/duyệt; `fields` = Record<chỉ tiêu, { value, source, suspect?, note? }>. Mỗi lần dựng lại = version mới. */
export const declarations = pgTable(
  "declarations",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("DRAFT"),
    fields: jsonb("fields").notNull(),
    exchangeRate: money("exchange_rate").notNull(),
    exchangeRateDate: date("exchange_rate_date").notNull(),
    customsValueVnd: money("customs_value_vnd").notNull(),
    valueAdjustments: jsonb("value_adjustments").notNull(),
    estImportDutyVnd: money("est_import_duty_vnd").notNull(),
    estVatVnd: money("est_vat_vnd").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("declarations_dossier_version_uq").on(t.dossierId, t.version), index("declarations_org_dossier_idx").on(t.orgId, t.dossierId), check("declarations_status_chk", sql`status in ('DRAFT', 'APPROVED', 'SUBMITTED')`), check("declarations_kind_chk", sql`kind in ('IDA', 'EDA')`), orgRls("declarations_rls")],
).enableRLS();

/** Mặc định khai báo + ghi đè nguồn chỉ tiêu của doanh nghiệp, theo chiều NK/XK (spec 2026-10-15 §5.2). */
export const declarationProfiles = pgTable(
  "declaration_profiles",
  {
    id: id(),
    orgId: orgId(),
    direction: text("direction").notNull(),
    values: jsonb("values").notNull().default({}),
    overrides: jsonb("overrides").notNull().default({}),
    updatedBy: text("updated_by"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("declaration_profiles_org_direction_uq").on(t.orgId, t.direction), orgRls("declaration_profiles_rls")],
).enableRLS();

/**
 * Danh mục hàng hóa của doanh nghiệp: mặt hàng đã khai trước đây (import bảng kê dòng hàng, thêm tay, hoặc tự thêm
 * khi tờ khai được duyệt). Mỗi mặt hàng một dòng theo `key` (mã hàng, không có thì tên chuẩn hóa – productKey).
 * `raw` = dòng gốc của lần khai gần nhất trong file import (tên cột → giá trị).
 */
/** Thuế suất phần trăm: tối đa 999999.9999. */
const rate = (name: string) => numeric(name, { precision: 10, scale: 4 });

export const productCatalog = pgTable(
  "product_catalog",
  {
    id: id(),
    orgId: orgId(),
    key: text("key").notNull(),
    /** Tên chuẩn hóa (normalizeProductName) – tra mặt hàng theo tên kể cả khi khóa là mã hàng. */
    nameKey: text("name_key").notNull(),
    code: text("code"),
    name: text("name").notNull(),
    hsCode: text("hs_code").notNull(),
    unit: text("unit"),
    origin: text("origin"),
    tariffSchedule: text("tariff_schedule"),
    // Thuế suất (%) và đơn giá là số: numeric, đọc/ghi dạng chuỗi Decimal (bất biến 3).
    importDutyRate: rate("import_duty_rate"),
    vatRate: rate("vat_rate"),
    envTaxRate: rate("env_tax_rate"),
    exciseRate: rate("excise_rate"),
    safeguardRate: rate("safeguard_rate"),
    antiDiscriminationRate: rate("anti_discrimination_rate"),
    description: text("description"),
    unit2: text("unit2"),
    unitPrice: money("unit_price"),
    currency: text("currency"),
    partner: text("partner"),
    note: text("note"),
    source: text("source").notNull(),
    timesDeclared: integer("times_declared").notNull().default(0),
    lastDeclarationNo: text("last_declaration_no"),
    lastDeclarationDate: date("last_declaration_date", { mode: "string" }),
    lastTypeCode: text("last_type_code"),
    raw: jsonb("raw"),
    updatedBy: text("updated_by"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("product_catalog_org_key_uq").on(t.orgId, t.key), index("product_catalog_org_name_idx").on(t.orgId, t.nameKey), index("product_catalog_org_hs_idx").on(t.orgId, t.hsCode), orgRls("product_catalog_rls")],
).enableRLS();

/** Lần chạy AI Agent (HS → ánh xạ → dựng tờ khai → số hóa). `tasks` = AgentRun.tasks; `log` = dòng nhật ký. */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("RUNNING"),
    tasks: jsonb("tasks").notNull(),
    log: jsonb("log").notNull().default([]),
    startedBy: text("started_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("agent_runs_org_dossier_idx").on(t.orgId, t.dossierId, t.startedAt), check("agent_runs_status_chk", sql`status in ('RUNNING', 'DONE', 'ERROR', 'CANCELLED')`), orgRls("agent_runs_rls")],
).enableRLS();

/** Biểu thuế tối thiểu (D1 BACKEND-TODO) – không theo org, mọi org đọc; chỉ admin/seed ghi. */
export const catalogHs = pgTable(
  "catalog_hs",
  {
    code: text("code").primaryKey(),
    description: text("description").notNull(),
    mfn: money("mfn").notNull(),
    /** { AK: "0", EVFTA: "10", … } thuế suất ưu đãi đặc biệt theo mẫu C/O. */
    pref: jsonb("pref").notNull().default({}),
    vat: money("vat").notNull(),
    policy: text("policy"),
    keywords: text("keywords").array().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [pgPolicy("catalog_hs_read", { for: "select", to: appRole, using: sql`true` })],
).enableRLS();

/** Tỷ giá tính thuế theo ngày (D2) – không theo org. */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: id(),
    currency: text("currency").notNull(),
    date: date("date").notNull(),
    rate: money("rate").notNull(),
    /** VCB (job tối thứ Năm) | MANUAL (đội vận hành nhập/sửa) | SEED (dữ liệu mẫu). `date` = thứ Hai bắt đầu hiệu lực. */
    source: text("source").notNull().default("SEED"),
    active: boolean("active").notNull().default(true),
    /** Giờ của bảng Vietcombank đã chụp. */
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
    note: text("note"),
  },
  (t) => [uniqueIndex("exchange_rates_currency_date_uq").on(t.currency, t.date), pgPolicy("exchange_rates_read", { for: "select", to: appRole, using: sql`true` })],
).enableRLS();

/** Nhật ký các lần lấy tỷ giá Vietcombank (khu Quản trị). Không theo org; kb_app không có policy → không đọc/ghi. */
export const exchangeRateFetches = pgTable("exchange_rate_fetches", {
  id: id(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  status: text("status").notNull(),
  count: integer("count").notNull().default(0),
  boardAt: timestamp("board_at", { withTimezone: true }),
  error: text("error"),
}).enableRLS();
