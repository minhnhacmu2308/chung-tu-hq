import type { OrgAuditWriter } from "../../../shared/audit.js";
import type { DocKind, InboxMessageStatus, MailConnectionStatus, MailFilters, MailProvider } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { Ctx } from "../../../shared/ctx.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { Result } from "../../../shared/result.js";
import type { SuggestDossier } from "../domain/suggest.js";

/* ---------------- Hàng trong DB ---------------- */

export type MailConnectionRow = {
  id: string; orgId: string; provider: MailProvider; email: string;
  /** Token OAuth (MailTokens JSON) mã hóa AES-256-GCM. */
  ciphertext: string; keyVersion: number;
  status: MailConnectionStatus; lastSyncedAt: Date | null; lastSyncCount: number; lastError: string | null;
  connectedBy: string; createdAt: Date; updatedAt: Date;
  /** Bộ lọc riêng của hộp thư; null = mặc định (DEFAULT_MAIL_FILTERS). */
  filters: MailFilters | null;
};
export type InboxMessageRow = {
  id: string; orgId: string; connectionId: string; provider: MailProvider; mailbox: string; providerMessageId: string;
  /** DELETED: người dùng đã xóa – giữ hàng (không file) để lần lấy thư sau không kéo lại email đó. */
  fromName: string; fromEmail: string; subject: string; snippet: string; receivedAt: Date; status: InboxMessageStatus | "DELETED"; createdAt: Date; updatedAt: Date;
};
export type InboxAttachmentRow = {
  id: string; orgId: string; messageId: string; fileName: string; mime: string; size: number; sha256: string; storageKey: string; kindGuess: DocKind;
  status: "PENDING" | "ADDED"; dossierId: string | null; addedBy: string | null; addedAt: Date | null; createdAt: Date;
};

export type MailboxRepos = {
  connections: {
    list(orgId: string): Promise<MailConnectionRow[]>;
    get(orgId: string, id: string): Promise<MailConnectionRow | null>;
    find(orgId: string, provider: MailProvider, email: string): Promise<MailConnectionRow | null>;
    insert(row: MailConnectionRow): Promise<void>;
    update(row: MailConnectionRow): Promise<void>;
    remove(orgId: string, id: string): Promise<void>;
    /** Kết nối SYNCING không được cập nhật từ trước `before` – job lấy thư có thể đã mất (job quét định kỳ). */
    listSyncingBefore(orgId: string, before: Date): Promise<MailConnectionRow[]>;
  };
  messages: {
    list(orgId: string): Promise<InboxMessageRow[]>;
    get(orgId: string, id: string): Promise<InboxMessageRow | null>;
    /** Mã email (của nhà cung cấp) đã có trong hộp thư của kết nối này – chống lấy trùng. */
    existingProviderIds(orgId: string, connectionId: string, providerIds: string[]): Promise<Set<string>>;
    insert(row: InboxMessageRow): Promise<void>;
    update(row: InboxMessageRow): Promise<void>;
  };
  attachments: {
    listByMessages(orgId: string, messageIds: string[]): Promise<InboxAttachmentRow[]>;
    byIds(orgId: string, ids: string[]): Promise<InboxAttachmentRow[]>;
    listByDossier(orgId: string, dossierId: string): Promise<InboxAttachmentRow[]>;
    insert(rows: InboxAttachmentRow[]): Promise<void>;
    update(row: InboxAttachmentRow): Promise<void>;
  };
};

export interface MailboxUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: MailboxRepos) => Promise<T>): Promise<T>;
}

/* ---------------- Nhà cung cấp hộp thư (Gmail API / Microsoft Graph / giả lập) ---------------- */

export type MailTokens = { accessToken: string; refreshToken: string | null; /** ISO UTC */ expiresAt: string };
export type RemoteAttachment = { id: string; fileName: string; mime: string; size: number };
export type RemoteMessage = { id: string; fromName: string; fromEmail: string; subject: string; snippet: string; receivedAt: Date; attachments: RemoteAttachment[] };

/** Token bị thu hồi / refresh token hết hạn → phải kết nối lại (không thử lại). */
export class MailAuthError extends Error {
  constructor(message = "mail auth failed") {
    super(message);
    this.name = "MailAuthError";
  }
}

export interface MailProviderAdapter {
  readonly provider: MailProvider;
  /** Máy chủ đã có client id/secret của nhà cung cấp. */
  readonly configured: boolean;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<{ tokens: MailTokens; email: string }>;
  /** Làm mới access token; refresh token bị thu hồi → MailAuthError. */
  refresh(tokens: MailTokens): Promise<MailTokens>;
  /**
   * Email nhận từ `since` (tính cả mốc) có file đính kèm và qua bộ lọc của hộp thư (người gửi, từ khóa, từ loại trừ –
   * domain/filters.ts), CŨ NHẤT TRƯỚC, tối đa `limit` (lần sau lấy tiếp từ email mới nhất của lô).
   * Chỉ trả file đính kèm thật (không ảnh nhúng trong nội dung). Loại / cỡ file do use case lọc. 401 → MailAuthError.
   */
  listMessages(tokens: MailTokens, since: Date, limit: number, filters: MailFilters): Promise<RemoteMessage[]>;
  getAttachment(tokens: MailTokens, messageId: string, attachmentId: string): Promise<Buffer>;
}

/** Tham số `state` của OAuth: ký HMAC, gắn org + người dùng + hạn dùng (chống CSRF / dùng lại). */
export type OAuthState = { orgId: string; userId: string; provider: MailProvider; exp: number; nonce: string };
export interface StateSigner {
  sign(state: OAuthState): string;
  verify(token: string): OAuthState | null;
}

export interface Cipher {
  encrypt(plain: string): { ciphertext: string; keyVersion: number };
  decrypt(ciphertext: string, keyVersion: number): string;
}

export interface BlobStore {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Cổng sang module hồ sơ (nối ở composition root). */
export interface DossierIntake {
  /** Hồ sơ của org để gợi ý (mọi trạng thái; domain tự lọc hồ sơ còn mở). */
  list(orgId: string): Promise<SuggestDossier[]>;
  /** Đưa file vào hồ sơ như tải tay (kiểm tra file, quota, lưu, xếp hàng AI đọc). */
  addFiles(ctx: Ctx, dossierId: string, files: { name: string; mime: string; bytes: Buffer }[]): Promise<Result<{ added: number }>>;
  /** Loại chứng từ đoán theo tên file (cùng luật tải tay). */
  guessKind(fileName: string): DocKind;
}

export type MailboxDeps = {
  uow: MailboxUow;
  /** Nhật ký hoạt động doanh nghiệp (kết nối/gỡ hộp thư); container nối từ identity. */
  audit?: OrgAuditWriter;
  providers: Record<MailProvider, MailProviderAdapter>;
  /** null khi máy chủ thiếu APP_MASTER_KEY → không kết nối được. */
  cipher: Cipher | null;
  state: StateSigner;
  storage: BlobStore;
  queue: JobQueue;
  dossiers: DossierIntake;
  members: { names(orgId: string, userIds: string[]): Promise<Record<string, string>> };
  /** `${APP_URL}/api/mailbox/oauth/callback` – phải khai báo ở Google Cloud / Azure App. */
  redirectUri: string;
  clock: Clock;
  idGen: IdGen;
};
