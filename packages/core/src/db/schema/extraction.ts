import { sql } from "drizzle-orm";
import { index, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
