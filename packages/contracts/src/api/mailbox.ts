// Hộp thư chứng từ: doanh nghiệp kết nối hộp thư Gmail / Outlook (OAuth 2.0, chỉ quyền đọc), bấm "Lấy chứng từ mới" →
// hệ thống lấy email có file đính kèm từ lần đồng bộ trước, chống trùng theo mã email, lưu file vào hộp thư chứng từ;
// người dùng xếp file vào hồ sơ (hệ thống gợi ý hồ sơ khớp) → file đi tiếp luồng tải chứng từ + AI đọc như tải tay.
import { z } from "zod";
import { DocKindSchema, IsoDateTimeSchema } from "../common.js";

export const MailProviderSchema = z.enum(["GMAIL", "OUTLOOK"]);
export type MailProvider = z.infer<typeof MailProviderSchema>;

/** SYNCING: đang lấy thư; ERROR: lần lấy gần nhất lỗi (thử lại được); REAUTH: token bị thu hồi/hết hạn → phải kết nối lại. */
export const MailConnectionStatusSchema = z.enum(["ACTIVE", "SYNCING", "ERROR", "REAUTH"]);
export type MailConnectionStatus = z.infer<typeof MailConnectionStatusSchema>;

export const MailConnectionSchema = z.object({
  id: z.string(),
  provider: MailProviderSchema,
  email: z.string(),
  status: MailConnectionStatusSchema,
  lastSyncedAt: IsoDateTimeSchema.nullable(),
  /** Số email mới lấy được ở lần đồng bộ gần nhất. */
  lastSyncCount: z.number().int().nonnegative(),
  /** Mã lý do lỗi gần nhất (reason code) để giao diện dịch. */
  lastError: z.string().nullable(),
  connectedBy: z.string(),
  connectedByName: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type MailConnection = z.infer<typeof MailConnectionSchema>;

/** Nhà cung cấp nào máy chủ đã cấu hình OAuth (client id/secret) → nút kết nối bật được. */
export const MailboxOverviewSchema = z.object({
  providers: z.array(z.object({ provider: MailProviderSchema, configured: z.boolean() })),
  connections: z.array(MailConnectionSchema),
});
export type MailboxOverview = z.infer<typeof MailboxOverviewSchema>;

export const StartMailConnectInputSchema = z.object({ provider: MailProviderSchema });
export type StartMailConnectInput = z.infer<typeof StartMailConnectInputSchema>;
/** URL trang đăng nhập + đồng ý của Google / Microsoft (trình duyệt chuyển tới). */
export const StartMailConnectResultSchema = z.object({ url: z.string().url() });
export type StartMailConnectResult = z.infer<typeof StartMailConnectResultSchema>;

export const MailSyncResultSchema = z.object({
  /** Số hộp thư được xếp lịch lấy thư. */
  queued: z.number().int().nonnegative(),
});
export type MailSyncResult = z.infer<typeof MailSyncResultSchema>;

/* ---------------- Hộp thư chứng từ ---------------- */

export const InboxAttachmentStatusSchema = z.enum(["PENDING", "ADDED"]);
export const InboxAttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  /** Loại chứng từ đoán theo tên file (AI phân loại lại khi file vào hồ sơ). */
  kindGuess: DocKindSchema,
  status: InboxAttachmentStatusSchema,
  dossierId: z.string().nullable(),
  dossierCode: z.string().nullable(),
});
export type InboxAttachment = z.infer<typeof InboxAttachmentSchema>;

/** NEW: chưa xếp hết file; DONE: mọi file đã vào hồ sơ; IGNORED: người dùng bỏ qua. */
export const InboxMessageStatusSchema = z.enum(["NEW", "DONE", "IGNORED"]);
export type InboxMessageStatus = z.infer<typeof InboxMessageStatusSchema>;

/** Vì sao gợi ý hồ sơ: mã hồ sơ / số vận đơn xuất hiện trong tiêu đề, tên file; hoặc tên đối tác khớp người gửi. */
export const InboxSuggestionReasonSchema = z.enum(["DOSSIER_CODE", "BILL_NO", "PARTNER"]);
export type InboxSuggestionReason = z.infer<typeof InboxSuggestionReasonSchema>;

export const InboxSuggestionSchema = z.object({
  dossierId: z.string(),
  dossierCode: z.string(),
  partner: z.string(),
  reason: InboxSuggestionReasonSchema,
});
export type InboxSuggestion = z.infer<typeof InboxSuggestionSchema>;

export const InboxMessageSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  provider: MailProviderSchema,
  mailbox: z.string(),
  fromName: z.string(),
  fromEmail: z.string(),
  subject: z.string(),
  snippet: z.string(),
  receivedAt: IsoDateTimeSchema,
  status: InboxMessageStatusSchema,
  attachments: z.array(InboxAttachmentSchema),
  suggestion: InboxSuggestionSchema.nullable(),
});
export type InboxMessage = z.infer<typeof InboxMessageSchema>;

export const AddInboxToDossierInputSchema = z.object({
  dossierId: z.string().min(1),
  attachmentIds: z.array(z.string().min(1)).min(1).max(50),
});
export type AddInboxToDossierInput = z.infer<typeof AddInboxToDossierInputSchema>;
export const AddInboxToDossierResultSchema = z.object({ added: z.number().int().nonnegative(), dossierId: z.string() });
export type AddInboxToDossierResult = z.infer<typeof AddInboxToDossierResultSchema>;

export const SetInboxMessageStatusInputSchema = z.object({ status: z.enum(["NEW", "IGNORED"]) });
export type SetInboxMessageStatusInput = z.infer<typeof SetInboxMessageStatusInputSchema>;

/* ---------------- Lọc email lấy về (dùng chung adapter + test) ---------------- */

/** Đuôi file nhận vào hộp thư (cùng loại file tải chứng từ chấp nhận). */
export const INBOX_FILE_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "zip"] as const;
export const INBOX_MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Từ khóa chứng từ xuất nhập khẩu tìm trong tiêu đề / nội dung / tên file. */
export const INBOX_KEYWORDS = [
  "invoice", "hóa đơn", "hoá đơn", "hoa don", "packing", "bill of lading", "b/l", "awb", "airway", "waybill", "c/o", "certificate of origin",
  "chứng từ", "chung tu", "arrival notice", "debit note", "contract", "hợp đồng", "tờ khai", "shipment", "lô hàng", "gtgt", "bill",
] as const;
/** Lần kết nối đầu tiên lấy thư bao nhiêu ngày gần nhất. */
export const INBOX_FIRST_SYNC_DAYS = 30;

export function inboxFileAccepted(fileName: string, size: number): boolean {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return (INBOX_FILE_EXTENSIONS as readonly string[]).includes(ext) && size > 0 && size <= INBOX_MAX_FILE_BYTES;
}
