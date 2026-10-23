import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./identity.js";
import { id, money, orgId, orgRls, timestamps } from "./shared.js";

/** Hồ sơ khai báo – một lô hàng qua 6 bước. */
export const dossiers = pgTable(
  "dossiers",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    code: text("code").notNull(),
    direction: text("direction").notNull(),
    typeCode: text("type_code").notNull(),
    partner: text("partner").notNull(),
    customsOfficeCode: text("customs_office_code").notNull(),
    customsOfficeName: text("customs_office_name").notNull().default(""),
    skillSetId: text("skill_set_id").notNull().default("default"),
    status: text("status").notNull().default("DRAFT"),
    step: text("step").notNull().default("upload"),
    dueDate: date("due_date").notNull(),
    ownerId: text("owner_id").notNull(),
    note: text("note"),
    invoiceValue: money("invoice_value").notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    incoterm: text("incoterm").notNull().default(""),
    transportMode: text("transport_mode").notNull().default("SEA_CONTAINER"),
    partyClass: text("party_class").notNull().default("4"),
    billNo: text("bill_no").notNull().default(""),
    suspectFields: integer("suspect_fields").notNull().default(0),
    declarationNo: text("declaration_no"),
    channel: text("channel"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("dossiers_org_code_uq").on(t.orgId, t.code),
    index("dossiers_org_status_idx").on(t.orgId, t.status),
    // Giá trị trạng thái/bước/chiều khớp enum @kb/contracts – DB chặn dữ liệu lạ (CHECK, không dùng pgEnum để đổi danh sách bằng migration nhẹ).
    check("dossiers_status_chk", sql`status in ('DRAFT', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'SUBMITTED', 'CLEARED', 'CANCELLED')`),
    check("dossiers_step_chk", sql`step in ('create', 'upload', 'ocr', 'agent', 'review', 'submit')`),
    check("dossiers_direction_chk", sql`direction in ('NK', 'XK')`),
    index("dossiers_org_updated_idx").on(t.orgId, t.updatedAt),
    orgRls("dossiers_rls"),
  ],
).enableRLS();

export const documents = pgTable(
  "documents",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    kind: text("kind").notNull().default("OTHER"),
    /** AI | USER | FILENAME – ai quyết định loại chứng từ. */
    kindSource: text("kind_source").notNull().default("FILENAME"),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    pages: integer("pages").notNull().default(0),
    status: text("status").notNull().default("QUEUED"),
    error: text("error"),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    ...timestamps(),
  },
  (t) => [index("documents_org_dossier_idx").on(t.orgId, t.dossierId), check("documents_status_chk", sql`status in ('UPLOADING', 'QUEUED', 'READING', 'DONE', 'ERROR')`), orgRls("documents_rls")],
).enableRLS();

export const documentPages = pgTable(
  "document_pages",
  {
    id: id(),
    orgId: orgId(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    kindDetected: text("kind_detected"),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    previewKey: text("preview_key"),
  },
  (t) => [uniqueIndex("document_pages_doc_page_uq").on(t.documentId, t.pageNo), orgRls("document_pages_rls")],
).enableRLS();

/** Tiến trình job nền cho SSE/polling. */
export const jobProgress = pgTable(
  "job_progress",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
    jobKind: text("job_kind").notNull(),
    jobId: text("job_id").notNull(),
    status: text("status").notNull(),
    progress: integer("progress").notNull().default(0),
    message: text("message").notNull().default(""),
    payload: jsonb("payload"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_progress_org_dossier_idx").on(t.orgId, t.dossierId, t.updatedAt), orgRls("job_progress_rls")],
).enableRLS();

