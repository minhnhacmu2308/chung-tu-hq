import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, orgId, orgRls, timestamps } from "./shared.js";

/**
 * Hộp thư Gmail / Outlook doanh nghiệp đã kết nối (OAuth, chỉ quyền đọc). `ciphertext` = token OAuth (JSON)
 * mã hóa AES-256-GCM bằng APP_MASTER_KEY; không bao giờ trả ra API.
 */
export const mailConnections = pgTable(
  "mail_connections",
  {
    id: id(),
    orgId: orgId(),
    provider: text("provider").notNull(),
    email: text("email").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    status: text("status").notNull().default("ACTIVE"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncCount: integer("last_sync_count").notNull().default(0),
    lastError: text("last_error"),
    connectedBy: text("connected_by").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("mail_connections_org_provider_email_uq").on(t.orgId, t.provider, t.email), orgRls("mail_connections_rls")],
).enableRLS();

/**
 * Email lấy về hộp thư chứng từ. Không FK sang mail_connections: gỡ kết nối vẫn giữ email đã lấy.
 * Chống lấy trùng theo (kết nối, mã email của nhà cung cấp).
 */
export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: id(),
    orgId: orgId(),
    connectionId: text("connection_id").notNull(),
    provider: text("provider").notNull(),
    mailbox: text("mailbox").notNull(),
    providerMessageId: text("provider_message_id").notNull(),
    fromName: text("from_name").notNull(),
    fromEmail: text("from_email").notNull(),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("NEW"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("inbox_messages_org_conn_msg_uq").on(t.orgId, t.connectionId, t.providerMessageId),
    index("inbox_messages_org_received_idx").on(t.orgId, t.receivedAt),
    orgRls("inbox_messages_rls"),
  ],
).enableRLS();

/** File đính kèm của email (đã lưu vào kho); `dossier_id` khi đã xếp vào hồ sơ. */
export const inboxAttachments = pgTable(
  "inbox_attachments",
  {
    id: id(),
    orgId: orgId(),
    messageId: text("message_id")
      .notNull()
      .references(() => inboxMessages.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    kindGuess: text("kind_guess").notNull(),
    status: text("status").notNull().default("PENDING"),
    dossierId: text("dossier_id"),
    addedBy: text("added_by"),
    addedAt: timestamp("added_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inbox_attachments_org_message_idx").on(t.orgId, t.messageId), index("inbox_attachments_org_dossier_idx").on(t.orgId, t.dossierId), orgRls("inbox_attachments_rls")],
).enableRLS();
