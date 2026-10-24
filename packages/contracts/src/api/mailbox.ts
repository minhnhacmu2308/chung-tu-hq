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

/* ---------------- Bộ lọc của từng hộp thư: chỉ lấy đúng email chứng từ ---------------- */

/**
 * DEFAULT: bộ từ khóa chứng từ có sẵn (INBOX_KEYWORDS) + từ khóa thêm của doanh nghiệp; CUSTOM: chỉ từ khóa của doanh nghiệp;
 * OFF: không lọc từ khóa (dùng khi đã giới hạn người gửi).
 */
export const MailKeywordModeSchema = z.enum(["DEFAULT", "CUSTOM", "OFF"]);
export type MailKeywordMode = z.infer<typeof MailKeywordModeSchema>;
/** SUBJECT: tìm trong tiêu đề + tên file; ALL: cả nội dung email. */
export const MailKeywordScopeSchema = z.enum(["SUBJECT", "ALL"]);
export type MailKeywordScope = z.infer<typeof MailKeywordScopeSchema>;

const term = z.string().trim().min(2).max(80);
/** Người gửi: email đầy đủ (a@congty.vn) hoặc cả tên miền (@congty.vn / congty.vn). */
const sender = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|@?[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/, "Email hoặc tên miền không hợp lệ");

export const MailFiltersSchema = z
  .object({
    /** Chỉ lấy email từ những người gửi / tên miền này; rỗng = mọi người gửi. */
    senders: z.array(sender).max(50),
    keywordMode: MailKeywordModeSchema,
    /** Từ khóa của doanh nghiệp (DEFAULT: thêm vào bộ có sẵn; CUSTOM: chỉ dùng các từ này). */
    keywords: z.array(term).max(50),
    keywordScope: MailKeywordScopeSchema,
    /** Bỏ qua email có tiêu đề / tên file chứa một trong các từ này (quảng cáo, bản tin…). */
    excludeKeywords: z.array(term).max(50),
    /** Loại file nhận (tập con của INBOX_FILE_EXTENSIONS). */
    extensions: z.array(z.enum(["pdf", "png", "jpg", "jpeg", "zip"])).min(1),
  })
  .superRefine((f, ctx) => {
    if (f.keywordMode === "CUSTOM" && f.keywords.length === 0) {
      ctx.addIssue({ code: "custom", path: ["keywords"], message: "Chế độ chỉ dùng từ khóa riêng cần ít nhất 1 từ khóa" });
    }
  });
export type MailFilters = z.infer<typeof MailFiltersSchema>;

/** Hành vi khi chưa cấu hình – đúng như trước khi có bộ lọc. */
export const DEFAULT_MAIL_FILTERS: MailFilters = {
  senders: [],
  keywordMode: "DEFAULT",
  keywords: [],
  keywordScope: "ALL",
  excludeKeywords: [],
  extensions: ["pdf", "png", "jpg", "jpeg", "zip"],
};

/** Bộ lọc đọc từ DB (có thể thiếu trường / dữ liệu cũ) → luôn đủ trường hợp lệ. */
export function normalizeMailFilters(raw: unknown): MailFilters {
  const r = MailFiltersSchema.safeParse({ ...DEFAULT_MAIL_FILTERS, ...(raw && typeof raw === "object" ? raw : {}) });
  return r.success ? r.data : DEFAULT_MAIL_FILTERS;
}

export const UpdateMailFiltersInputSchema = z.object({
  filters: MailFiltersSchema,
  /** Quét lại email trong INBOX_FIRST_SYNC_DAYS ngày gần nhất theo bộ lọc mới ở lần lấy tới (không lấy trùng). */
  rescan: z.boolean().default(false),
});
export type UpdateMailFiltersInput = z.infer<typeof UpdateMailFiltersInputSchema>;

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
  filters: MailFiltersSchema,
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

/** File nhận được không: đúng loại (theo `extensions` của bộ lọc, mặc định mọi loại cho phép) và 0 < cỡ ≤ 25 MB. */
export function inboxFileAccepted(fileName: string, size: number, extensions: readonly string[] = INBOX_FILE_EXTENSIONS): boolean {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return (INBOX_FILE_EXTENSIONS as readonly string[]).includes(ext) && extensions.includes(ext) && size > 0 && size <= INBOX_MAX_FILE_BYTES;
}
