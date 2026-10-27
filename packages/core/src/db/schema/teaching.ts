import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, orgId, orgRls, timestamps } from "./shared.js";

/** Bật/tắt "Dùng bài học khi dựng tờ khai nháp" theo doanh nghiệp (mục Dạy khai báo). Không có dòng = tắt. */
export const teachSettings = pgTable(
  "teach_settings",
  {
    orgId: text("org_id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    ...timestamps(),
  },
  () => [orgRls("teach_settings_rls")],
).enableRLS();

/** Tờ khai đã thông quan doanh nghiệp upload để dạy: file, kết quả đọc, hồ sơ ghép được, kết quả so với tờ khai nháp. */
export const teachSamples = pgTable(
  "teach_samples",
  {
    id: id(),
    orgId: orgId(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    pages: integer("pages").notNull().default(1),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** UPLOADED → READING → READ | FAILED. */
    status: text("status").notNull().default("UPLOADED"),
    declarationNo: text("declaration_no"),
    /** Kết quả AI đọc tờ khai (CustomsDeclarationExtraction). */
    read: jsonb("read"),
    dossierId: text("dossier_id"),
    dossierCode: text("dossier_code"),
    /** { fields: TeachFieldDiff[], lines: TeachLineDiff[] } – null khi không có hồ sơ để so. */
    comparison: jsonb("comparison"),
    matched: integer("matched"),
    total: integer("total"),
    lessons: integer("lessons").notNull().default(0),
    error: text("error"),
    uploadedBy: text("uploaded_by"),
    ...timestamps(),
  },
  (t) => [index("teach_samples_org_idx").on(t.orgId, t.createdAt), orgRls("teach_samples_rls")],
).enableRLS();

/** Bài học: (loại, chỉ tiêu, ngữ cảnh[, câu]) → giá trị; đếm số lần gặp, giá trị mâu thuẫn; chỉ ACTIVE mới được áp. */
export const teachLessons = pgTable(
  "teach_lessons",
  {
    id: id(),
    orgId: orgId(),
    /** FIELD | CLAUSE | LINE. */
    kind: text("kind").notNull(),
    fieldCode: text("field_code").notNull(),
    contextKey: text("context_key").notNull(),
    /** Khóa duy nhất trong org (lessonIdentity) – upsert khi gặp lại. */
    identity: text("identity").notNull(),
    context: jsonb("context").notNull(),
    value: text("value").notNull(),
    line: jsonb("line"),
    hits: integer("hits").notNull().default(1),
    conflicts: jsonb("conflicts").notNull().default([]),
    /** PENDING | ACTIVE | OFF. */
    status: text("status").notNull().default("PENDING"),
    sampleIds: jsonb("sample_ids").notNull().default([]),
    lastDeclarationNo: text("last_declaration_no"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("teach_lessons_identity_uq").on(t.orgId, t.identity), index("teach_lessons_org_status_idx").on(t.orgId, t.status), orgRls("teach_lessons_rls")],
).enableRLS();
