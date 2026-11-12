import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgPolicy, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { documents, dossiers } from "./dossier.js";
import { appRole, id, orgId, orgPolicyUsing, orgRls, timestamps } from "./shared.js";

/** Một lần gọi AI đọc một chứng từ (phiên bản prompt/schema/pipeline để idempotent). */
export const extractions = pgTable(
  "extractions",
  {
    id: id(),
    orgId: orgId(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    skillVersionId: text("skill_version_id"),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    pipelineVersion: text("pipeline_version").notNull(),
    model: text("model").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    raw: jsonb("raw"),
    regions: jsonb("regions"),
    status: text("status").notNull().default("DONE"),
    error: text("error"),
    usageEventId: text("usage_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("extractions_idem_uq").on(t.idempotencyKey), index("extractions_org_doc_idx").on(t.orgId, t.documentId), orgRls("extractions_rls")],
).enableRLS();

/** Dữ liệu lô hàng gộp, có phiên bản. */
export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    data: jsonb("data").notNull(),
    schemaVersion: text("schema_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shipments_dossier_version_uq").on(t.dossierId, t.version), orgRls("shipments_rls")],
).enableRLS();

/** Dữ liệu lô hàng nhập tay (ADR 0013 – Khai trước), một dòng mỗi hồ sơ; ghép vào shipment mỗi lần gộp. */
export const manualShipments = pgTable(
  "manual_shipments",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull(),
    updatedBy: text("updated_by").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("manual_shipments_org_dossier_uq").on(t.orgId, t.dossierId), orgRls("manual_shipments_rls")],
).enableRLS();

/** Hình chiếu của shipment cho màn OCR: từng trường, có vị trí và trạng thái. */
export const extractedFields = pgTable(
  "extracted_fields",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    group: text("group").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull().default(""),
    originalValue: text("original_value").notNull().default(""),
    status: text("status").notNull(),
    region: jsonb("region"),
    note: text("note"),
    /** Đường dẫn JSON trong shipment.data mà trường này chiếu (vd /invoice/no, /items/0/quantity). */
    shipmentPath: text("shipment_path"),
    confirmedBy: text("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("extracted_fields_doc_key_uq").on(t.documentId, t.key), index("extracted_fields_org_dossier_idx").on(t.orgId, t.dossierId), orgRls("extracted_fields_rls")],
).enableRLS();

/** Nhật ký sửa trường – append-only: chỉ INSERT/SELECT (B6). */
export const fieldAudit = pgTable(
  "field_audit",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
    fieldId: text("field_id"),
    documentId: text("document_id"),
    key: text("key").notNull(),
    oldValue: text("old_value").notNull().default(""),
    newValue: text("new_value").notNull().default(""),
    userId: text("user_id").notNull(),
    source: text("source").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("field_audit_org_dossier_idx").on(t.orgId, t.dossierId, t.at),
    pgPolicy("field_audit_select", { for: "select", to: appRole, using: orgPolicyUsing }),
    pgPolicy("field_audit_insert", { for: "insert", to: appRole, withCheck: sql`${orgPolicyUsing}` }),
  ],
).enableRLS();

/**
 * Hóa đơn thương mại do hệ thống phát hành (ADR 0013 mục 3 – sau thông quan). Một dòng một số:
 * RESERVED = đã cấp số (điền vào tờ khai, chưa có nội dung) → ISSUED = đã phát hành sau thông quan (snapshot đóng băng, in được);
 * VOID = đã hủy (số không dùng lại). Số duy nhất theo (org, loại); mỗi hồ sơ tối đa một số đang dùng (index một phần).
 */
export const issuedDocuments = pgTable(
  "issued_documents",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    /** "INVOICE" – hóa đơn thương mại (Packing List in cùng số). */
    kind: text("kind").notNull(),
    no: text("no").notNull(),
    status: text("status").notNull(),
    /** Nội dung lúc phát hành – null khi mới cấp số. */
    snapshot: jsonb("snapshot"),
    /** Cấp số: ai, lúc nào. */
    issuedBy: text("issued_by").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    /** Phát hành (sau thông quan): ai, lúc nào, theo mẫu nào. */
    releasedBy: text("released_by"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    templateId: text("template_id"),
    voidedBy: text("voided_by"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("issued_documents_org_no_uq").on(t.orgId, t.kind, t.no),
    uniqueIndex("issued_documents_one_current_uq").on(t.orgId, t.dossierId, t.kind).where(sql`status in ('RESERVED', 'ISSUED')`),
    index("issued_documents_org_dossier_idx").on(t.orgId, t.dossierId),
    check("issued_documents_status_chk", sql`status in ('RESERVED', 'ISSUED', 'VOID')`),
    orgRls("issued_documents_rls"),
  ],
).enableRLS();

/** Bộ đếm số chứng từ theo doanh nghiệp / loại / mẫu số (cột `prefix` giữ mẫu) / kỳ đánh lại. Tăng bằng UPSERT … RETURNING trong transaction cấp số – khóa dòng tới khi commit. */
export const documentCounters = pgTable(
  "document_counters",
  {
    orgId: orgId(),
    kind: text("kind").notNull(),
    prefix: text("prefix").notNull(),
    period: text("period").notNull(),
    last: integer("last").notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.kind, t.prefix, t.period] }), orgRls("document_counters_rls")],
).enableRLS();

/** Mẫu in hóa đơn thương mại do doanh nghiệp thiết kế (layout = InvoiceLayout, parse Zod khi đọc). Tối đa một mẫu mặc định mỗi doanh nghiệp. */
export const invoiceTemplates = pgTable(
  "invoice_templates",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    layout: jsonb("layout").notNull(),
    createdBy: text("created_by").notNull(),
    ...timestamps(),
  },
  (t) => [
    index("invoice_templates_org_idx").on(t.orgId),
    uniqueIndex("invoice_templates_one_default_uq").on(t.orgId).where(sql`is_default`),
    orgRls("invoice_templates_rls"),
  ],
).enableRLS();
