import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgPolicy, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
    ...timestamps(),
  },
  (t) => [uniqueIndex("line_items_dossier_line_uq").on(t.dossierId, t.lineNo), index("line_items_org_dossier_idx").on(t.orgId, t.dossierId), orgRls("line_items_rls")],
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
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hs_suggestions_item_idx").on(t.lineItemId), orgRls("hs_suggestions_rls")],
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
  (t) => [uniqueIndex("declarations_dossier_version_uq").on(t.dossierId, t.version), index("declarations_org_dossier_idx").on(t.orgId, t.dossierId), orgRls("declarations_rls")],
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
  (t) => [index("agent_runs_org_dossier_idx").on(t.orgId, t.dossierId, t.startedAt), orgRls("agent_runs_rls")],
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
    source: text("source").notNull().default("MANUAL"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("exchange_rates_currency_date_uq").on(t.currency, t.date), pgPolicy("exchange_rates_read", { for: "select", to: appRole, using: sql`true` })],
).enableRLS();
