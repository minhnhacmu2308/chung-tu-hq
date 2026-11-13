import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dossiers } from "./dossier.js";
import { organizations } from "./identity.js";
import { appRole, id, money, orgId, orgPolicyUsing, orgRls, timestamps } from "./shared.js";

/** Trạng thái kết nối hệ thống ngoài theo doanh nghiệp (hscodepro, Customs Hub/FPT, AI, HĐĐT). */
export const integrationStatus = pgTable(
  "integration_status",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("NOT_CONFIGURED"),
    detail: text("detail"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("integration_status_org_kind_uq").on(t.orgId, t.kind), index("integration_status_org_idx").on(t.orgId), orgRls("integration_status_rls")],
).enableRLS();

/** Outbox truyền Hải quan: mỗi nghiệp vụ (IDA/IDC/HYS…) một dòng; `idempotency_key` chống gửi trùng (ADR 0005). */
export const customsOutbox = pgTable(
  "customs_outbox",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
    /** Nhánh (tờ khai ≤ 50 dòng) của hồ sơ; hồ sơ 1 tờ = nhánh 1. */
    branch: integer("branch").notNull().default(1),
    declarationId: text("declaration_id").notNull(),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("customs_outbox_key_uq").on(t.idempotencyKey), index("customs_outbox_org_dossier_idx").on(t.orgId, t.dossierId, t.branch), check("customs_outbox_status_chk", sql`status in ('PENDING', 'SENT', 'FAILED')`), orgRls("customs_outbox_rls")],
).enableRLS();

/** Nhật ký thông điệp đi/đến với Hải quan – append-only (không có policy UPDATE/DELETE), payload đã che bí mật. */
export const customsMessages = pgTable(
  "customs_messages",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
    /** Nhánh (tờ khai ≤ 50 dòng) của hồ sơ; hồ sơ 1 tờ = nhánh 1. */
    branch: integer("branch").notNull().default(1),
    operation: text("operation").notNull(),
    direction: text("direction").notNull(),
    result: text("result").notNull(),
    summary: text("summary").notNull(),
    payloadMasked: jsonb("payload_masked").notNull(),
    externalRef: text("external_ref"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customs_messages_org_dossier_idx").on(t.orgId, t.dossierId, t.branch, t.at),
    pgPolicy("customs_messages_read", { for: "select", to: appRole, using: orgPolicyUsing }),
    pgPolicy("customs_messages_insert", { for: "insert", to: appRole, withCheck: orgPolicyUsing }),
  ],
).enableRLS();

/**
 * Hộp thư thông điệp Hải quan trả sau (FPT VNACCSREP – lấy một lần, FPT không trả lại): cả lô lưu ngay khi lấy, rồi mới áp vào tờ khai.
 * PENDING = chưa khớp tờ khai nào (thử lại lượt sau), APPLIED = đã ghi nhật ký + cập nhật kết quả, UNMATCHED = quá số lần thử – giữ để tra.
 * `dedup_key` (mã thông điệp + số tờ khai + thời điểm) chống ghi trùng khi FPT gửi lại.
 */
export const customsInbox = pgTable(
  "customs_inbox",
  {
    id: id(),
    orgId: orgId(),
    dedupKey: text("dedup_key").notNull(),
    kind: text("kind").notNull(),
    code: text("code").notNull(),
    declarationNo: text("declaration_no").notNull(),
    message: jsonb("message").notNull(),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("customs_inbox_org_key_uq").on(t.orgId, t.dedupKey),
    index("customs_inbox_org_status_idx").on(t.orgId, t.status, t.receivedAt),
    check("customs_inbox_status_chk", sql`status in ('PENDING', 'APPLIED', 'UNMATCHED')`),
    orgRls("customs_inbox_rls"),
  ],
).enableRLS();

/** Kết quả hiện tại của tờ khai bên Hải quan: số tờ khai, phân luồng, thông quan, thuế, trạng thái truyền. */
export const customsResults = pgTable(
  "customs_results",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
    /** Nhánh (tờ khai ≤ 50 dòng) của hồ sơ; hồ sơ 1 tờ = nhánh 1. */
    branch: integer("branch").notNull().default(1),
    externalId: text("external_id"),
    declarationNo: text("declaration_no"),
    channel: text("channel"),
    channelNote: text("channel_note"),
    clearanceStatus: text("clearance_status").notNull().default("WAITING"),
    customsTaxVnd: money("customs_tax_vnd"),
    state: text("state").notNull().default("APPROVED"),
    pollCount: integer("poll_count").notNull().default(0),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customs_results_dossier_branch_uq").on(t.dossierId, t.branch), index("customs_results_org_idx").on(t.orgId, t.updatedAt), orgRls("customs_results_rls")],
).enableRLS();

/**
 * Bản khai bổ sung sau thông quan (AMA) – bản riêng tham chiếu tờ khai gốc, không sửa tờ khai gốc.
 * `header`/`lines` lưu theo tên trường VNACCS (VN_AMA / VN_AMA_HANG); `result` = Hải quan trả về sau AMA. Một hồ sơ nhiều lần (seq).
 */
export const postAmendments = pgTable(
  "post_amendments",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
    /** Nhánh (tờ khai ≤ 50 dòng) của hồ sơ; hồ sơ 1 tờ = nhánh 1. */
    branch: integer("branch").notNull().default(1),
    seq: integer("seq").notNull(),
    status: text("status").notNull().default("DRAFT"),
    header: jsonb("header").notNull(),
    lines: jsonb("lines").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    result: jsonb("result"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("post_amendments_dossier_branch_seq_uq").on(t.dossierId, t.branch, t.seq), index("post_amendments_org_dossier_idx").on(t.orgId, t.dossierId), orgRls("post_amendments_rls")],
).enableRLS();

/**
 * Bộ tập tin đính kèm HYS (VNACCS_HYS) – khai được trước IDA/EDA; số tiếp nhận điền vào 1.63/2.53 của tờ khai.
 * `fill` = kết quả điền ô (xem HysFill ở @kb/contracts); một hồ sơ nhiều bộ (seq).
 */
export const hysSubmissions = pgTable(
  "hys_submissions",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    procedureCode: text("procedure_code"),
    /** Phân loại đính kèm điền vào TK_EA 1.63/2.53 (bảng ATTACH_KIND); null = chưa chọn – lúc gửi lấy đề xuất theo chứng từ. */
    attachKind: text("attach_kind"),
    customsOffice: text("customs_office"),
    processingUnit: text("processing_unit"),
    phone: text("phone"),
    internalRef: text("internal_ref"),
    note: text("note"),
    purpose: text("purpose"),
    status: text("status").notNull().default("DRAFT"),
    attempt: integer("attempt").notNull().default(0),
    receiptNo: text("receipt_no"),
    registeredOn: date("registered_on", { mode: "string" }),
    reject: jsonb("reject"),
    fill: jsonb("fill"),
    sentBy: text("sent_by"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("hys_submissions_dossier_seq_uq").on(t.dossierId, t.seq),
    index("hys_submissions_org_dossier_idx").on(t.orgId, t.dossierId),
    check("hys_submissions_status_chk", sql`status in ('DRAFT', 'SENDING', 'ACCEPTED', 'REJECTED', 'SEND_FAILED')`),
    check("hys_submissions_purpose_chk", sql`purpose is null or purpose in ('PRE_DECLARATION', 'SUPPLEMENT')`),
    check("hys_submissions_attach_kind_chk", sql`attach_kind is null or attach_kind in ('INV', 'BOL', 'AWB', 'INS', 'CON', 'DM', 'ALL', 'ETC')`),
    orgRls("hys_submissions_rls"),
  ],
).enableRLS();

/** File của một bộ HYS. File chọn từ hồ sơ chép `storage_key` của `documents`; file riêng có khóa riêng trong kho. */
export const hysSubmissionFiles = pgTable(
  "hys_submission_files",
  {
    id: id(),
    orgId: orgId(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => hysSubmissions.id, { onDelete: "cascade" }),
    documentId: text("document_id"),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hys_submission_files_org_sub_idx").on(t.orgId, t.submissionId), orgRls("hys_submission_files_rls")],
).enableRLS();

/**
 * Danh sách container khai qua khu vực giám sát (V5ContainerReq/Res, ADR 0014) – mỗi lần gửi một dòng (attempt) theo (hồ sơ, nhánh).
 * `rows` = bảng đang soạn; `sent_rows` = ảnh chụp đã gửi; `errors` = lỗi Hải quan (GatewayError[]).
 */
export const containerLists = pgTable(
  "container_lists",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    /** Nhánh (tờ khai ≤ 50 dòng) của hồ sơ; hồ sơ 1 tờ = nhánh 1. */
    branch: integer("branch").notNull().default(1),
    attempt: integer("attempt").notNull(),
    rows: jsonb("rows").notNull(),
    status: text("status").notNull().default("DRAFT"),
    refId: text("ref_id"),
    receiptNo: text("receipt_no"),
    receiptDate: date("receipt_date", { mode: "string" }),
    errors: jsonb("errors"),
    sentRows: jsonb("sent_rows"),
    sentBy: text("sent_by"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("container_lists_dossier_branch_attempt_uq").on(t.dossierId, t.branch, t.attempt),
    index("container_lists_org_dossier_idx").on(t.orgId, t.dossierId, t.branch),
    check("container_lists_status_chk", sql`status in ('DRAFT', 'SENDING', 'ACCEPTED', 'REJECTED', 'NO_RESPONSE')`),
    orgRls("container_lists_rls"),
  ],
).enableRLS();

/** Bảng kê qua khu vực giám sát (KVGS, ADR 0014) lấy từ Hải quan: `sheet` = bản đã chuẩn hóa, `raw` = phản hồi thô. Mỗi lần lấy một dòng. */
export const kvgsSheets = pgTable(
  "kvgs_sheets",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    branch: integer("branch").notNull().default(1),
    status: text("status").notNull().default("SENDING"),
    refId: text("ref_id"),
    receiptNo: text("receipt_no"),
    receiptDate: date("receipt_date", { mode: "string" }),
    errors: jsonb("errors"),
    sheet: jsonb("sheet"),
    raw: jsonb("raw"),
    requestedBy: text("requested_by").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("kvgs_sheets_org_dossier_idx").on(t.orgId, t.dossierId, t.branch),
    // Một bảng kê đang SENDING mỗi (hồ sơ, nhánh): hai yêu cầu song song không tạo hai lần gọi/tính phí.
    uniqueIndex("kvgs_sheets_sending_uq").on(t.dossierId, t.branch).where(sql`${t.status} = 'SENDING'`),
    check("kvgs_sheets_status_chk", sql`status in ('DRAFT', 'SENDING', 'ACCEPTED', 'REJECTED', 'NO_RESPONSE')`),
    orgRls("kvgs_sheets_rls"),
  ],
).enableRLS();
