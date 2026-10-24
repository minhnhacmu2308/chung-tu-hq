import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  (t) => [uniqueIndex("customs_outbox_key_uq").on(t.idempotencyKey), index("customs_outbox_org_dossier_idx").on(t.orgId, t.dossierId), check("customs_outbox_status_chk", sql`status in ('PENDING', 'SENT', 'FAILED')`), orgRls("customs_outbox_rls")],
).enableRLS();

/** Nhật ký thông điệp đi/đến với Hải quan – append-only (không có policy UPDATE/DELETE), payload đã che bí mật. */
export const customsMessages = pgTable(
  "customs_messages",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
    operation: text("operation").notNull(),
    direction: text("direction").notNull(),
    result: text("result").notNull(),
    summary: text("summary").notNull(),
    payloadMasked: jsonb("payload_masked").notNull(),
    externalRef: text("external_ref"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customs_messages_org_dossier_idx").on(t.orgId, t.dossierId, t.at),
    pgPolicy("customs_messages_read", { for: "select", to: appRole, using: orgPolicyUsing }),
    pgPolicy("customs_messages_insert", { for: "insert", to: appRole, withCheck: orgPolicyUsing }),
  ],
).enableRLS();

/** Kết quả hiện tại của tờ khai bên Hải quan: số tờ khai, phân luồng, thông quan, thuế, trạng thái truyền. */
export const customsResults = pgTable(
  "customs_results",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
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
  (t) => [uniqueIndex("customs_results_dossier_uq").on(t.dossierId), index("customs_results_org_idx").on(t.orgId, t.updatedAt), orgRls("customs_results_rls")],
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
    seq: integer("seq").notNull(),
    status: text("status").notNull().default("DRAFT"),
    header: jsonb("header").notNull(),
    lines: jsonb("lines").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    result: jsonb("result"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("post_amendments_dossier_seq_uq").on(t.dossierId, t.seq), index("post_amendments_org_dossier_idx").on(t.orgId, t.dossierId), orgRls("post_amendments_rls")],
).enableRLS();
