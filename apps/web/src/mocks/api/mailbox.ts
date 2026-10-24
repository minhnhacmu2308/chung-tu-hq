// Hộp thư chứng từ (mock) – cùng quy tắc với backend (@kb/core mailbox/application/{connections,inbox}.ts).
// Không có OAuth thật: "Kết nối" thêm (hoặc kích hoạt lại) hộp thư mẫu rồi trả về đúng URL mà callback OAuth thật chuyển về.
// "Lấy thư" mô phỏng bằng thời gian: hộp thư ở SYNCING vài giây; lần đầu nhận lô email mẫu, các lần sau không có email mới.
import {
  AddInboxToDossierInputSchema, DEFAULT_MAIL_FILTERS, normalizeMailFilters, UpdateMailFiltersInputSchema, type AddInboxToDossierInput, type AddInboxToDossierResult, type InboxMessage, type InboxMessageStatus,
  type MailboxOverview, type MailConnection, type MailProvider, type MailSyncResult, type StartMailConnectResult, type UpdateMailFiltersInput,
} from "@kb/contracts";
import { ApiError, mutate, nowIso } from "@/lib/mock-request";
import { getDb, type MockDb } from "@/mocks/db";
import { suggestDossier } from "@/mocks/mailbox-suggest";
import { reasonApiError } from "@/mocks/reason-error";
import { samplePdf } from "@/mocks/sample-pdf";
import { demoSyncBatch, type MockMailConnection } from "@/mocks/seed/mailbox";
import { addDocumentFiles } from "./ocr";

export const mailboxKeys = { overview: ["mailbox", "overview"] as const };
export const inboxKeys = { all: ["inbox"] as const, list: ["inbox", "list"] as const };

/** Thời gian một lần lấy thư trong mock. */
export const MOCK_SYNC_MS = 2500;

const roleOf = (db: MockDb) => db.members.find((m) => m.id === db.currentUserId)?.role;
/** Mọi thành viên trừ Người xem được kết nối hộp thư, lấy thư và xếp file vào hồ sơ. */
function assertCanUse(db: MockDb) {
  const role = roleOf(db);
  if (role !== "OWNER" && role !== "ADMIN" && role !== "DECLARANT" && role !== "APPROVER") throw new ApiError("FORBIDDEN", "Cần vai trò DECLARANT/APPROVER/ADMIN", 403);
}

/** Hộp thư đang lấy thư đủ lâu → xong: lần đầu nhận lô email mẫu, các lần sau không có gì mới. */
function advance(db: MockDb, now = Date.now()) {
  for (const c of db.mailConnections) {
    if (c.status !== "SYNCING" || !c.syncStartedAt || now - Date.parse(c.syncStartedAt) < MOCK_SYNC_MS) continue;
    let added = 0;
    if (!db.inboxDemoBatchDelivered) {
      const batch = demoSyncBatch(c, now).filter((m) => !db.inboxMessages.some((x) => x.id === m.id));
      db.inboxMessages.push(...batch);
      db.inboxDemoBatchDelivered = true;
      added = batch.length;
    }
    Object.assign(c, { status: "ACTIVE", lastError: null, lastSyncCount: added, lastSyncedAt: new Date(now).toISOString(), syncStartedAt: null });
  }
}

const toConnectionDto = (db: MockDb, c: MockMailConnection) => {
  const { syncStartedAt: _, ...rest } = c;
  // normalize: dữ liệu mock cũ trong localStorage chưa có bộ lọc.
  return { ...rest, filters: normalizeMailFilters(c.filters), connectedByName: db.members.find((m) => m.id === c.connectedBy)?.name ?? "—" };
};

export const getMailboxOverview = () =>
  mutate((db): MailboxOverview => {
    advance(db);
    return {
      providers: [{ provider: "GMAIL", configured: true }, { provider: "OUTLOOK", configured: true }],
      connections: [...db.mailConnections].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c) => toConnectionDto(db, c)),
    };
  });

/** Mock: không có trang đồng ý của Google / Microsoft – coi như người dùng đã đăng nhập và cấp quyền. */
export const startMailConnect = (provider: MailProvider) =>
  mutate((db): StartMailConnectResult => {
    assertCanUse(db);
    const now = nowIso();
    // Kết nối lại hộp thư đang lỗi của nhà cung cấp này; không có thì thêm (hoặc bật lại) hộp thư mẫu.
    const email = `demo@${provider === "GMAIL" ? "gmail" : "outlook"}.com`;
    const cur = db.mailConnections.find((c) => c.provider === provider && (c.status === "REAUTH" || c.status === "ERROR")) ?? db.mailConnections.find((c) => c.provider === provider && c.email === email);
    if (cur) Object.assign(cur, { status: "ACTIVE", lastError: null, connectedBy: db.currentUserId, syncStartedAt: null });
    else {
      db.mailConnections.push({
        id: `mcn_${provider.toLowerCase()}_${db.mailConnections.length + 1}`, provider, email, status: "ACTIVE", lastSyncedAt: null, lastSyncCount: 0, lastError: null,
        connectedBy: db.currentUserId, createdAt: now, syncStartedAt: null, filters: DEFAULT_MAIL_FILTERS,
      });
    }
    const connected = cur?.email ?? email;
    return { url: `/settings?tab=integrations&mailbox=connected&email=${encodeURIComponent(connected)}` };
  });

/** Gỡ kết nối: người đã kết nối hoặc Quản trị / Chủ sở hữu. Email đã lấy vẫn ở hộp thư chứng từ. */
export const disconnectMailbox = (id: string) =>
  mutate((db) => {
    assertCanUse(db);
    const cur = db.mailConnections.find((c) => c.id === id);
    if (!cur) throw reasonApiError("NOT_FOUND", "MAILBOX_NOT_FOUND");
    const role = roleOf(db);
    if (cur.connectedBy !== db.currentUserId && role !== "ADMIN" && role !== "OWNER") throw reasonApiError("FORBIDDEN", "MAILBOX_NOT_FOUND");
    db.mailConnections = db.mailConnections.filter((c) => c.id !== id);
    return { removed: true as const };
  });

/**
 * Lưu bộ lọc: người đã kết nối hoặc Quản trị / Chủ sở hữu. Mock chỉ lưu (lô email mẫu không lọc theo bộ lọc);
 * `rescan` → mốc lấy thư về trống như backend.
 */
export const updateMailFilters = (id: string, input: UpdateMailFiltersInput) =>
  mutate((db): MailConnection => {
    assertCanUse(db);
    const parsed = UpdateMailFiltersInputSchema.safeParse(input);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0]?.message ?? "Bộ lọc không hợp lệ", 400);
    const cur = db.mailConnections.find((c) => c.id === id);
    if (!cur) throw reasonApiError("NOT_FOUND", "MAILBOX_NOT_FOUND");
    const role = roleOf(db);
    if (cur.connectedBy !== db.currentUserId && role !== "ADMIN" && role !== "OWNER") throw reasonApiError("FORBIDDEN", "MAILBOX_NOT_FOUND");
    cur.filters = parsed.data.filters;
    if (parsed.data.rescan) cur.lastSyncedAt = null;
    return toConnectionDto(db, cur);
  });

/** "Lấy chứng từ mới": mọi hộp thư (hoặc một hộp thư) còn dùng được chuyển sang đang lấy thư. */
export const requestMailSync = (connectionId?: string) =>
  mutate((db): MailSyncResult => {
    assertCanUse(db);
    advance(db);
    const now = nowIso();
    const targets = db.mailConnections.filter((c) => (connectionId ? c.id === connectionId : true) && c.status !== "REAUTH" && c.status !== "SYNCING");
    if (connectionId && !targets.length && !db.mailConnections.some((c) => c.id === connectionId)) throw reasonApiError("NOT_FOUND", "MAILBOX_NOT_FOUND");
    for (const c of targets) Object.assign(c, { status: "SYNCING", syncStartedAt: now });
    return { queued: targets.length };
  });

export const listInbox = () =>
  mutate((db): InboxMessage[] => {
    advance(db);
    const codeOf = new Map(db.dossiers.map((d) => [d.id, d.code]));
    const dossiers = db.dossiers.map((d) => ({ id: d.id, code: d.code, partner: d.partner, billNo: d.billNo, status: d.status, updatedAt: d.updatedAt }));
    return [...db.inboxMessages]
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map((m) => {
        const files = [...m.attachments].sort((a, b) => a.fileName.localeCompare(b.fileName));
        return {
          ...m,
          attachments: files.map((a) => ({ ...a, dossierCode: a.dossierId ? (codeOf.get(a.dossierId) ?? null) : null })),
          suggestion: m.status === "NEW" ? suggestDossier({ subject: m.subject, fromName: m.fromName, fromEmail: m.fromEmail, fileNames: files.map((f) => f.fileName) }, dossiers) : null,
        };
      });
  });

/** Đưa file đã chọn vào hồ sơ – đi tiếp luồng upload chứng từ của mock (phân loại, AI đọc). Email hết file chờ → "Đã xếp". */
export const addInboxToDossier = (input: AddInboxToDossierInput) =>
  mutate((db): AddInboxToDossierResult => {
    assertCanUse(db);
    const parsed = AddInboxToDossierInputSchema.safeParse(input);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const ids = [...new Set(parsed.data.attachmentIds)];
    const rows = db.inboxMessages.flatMap((m) => m.attachments.map((a) => ({ m, a }))).filter(({ a }) => ids.includes(a.id));
    if (rows.length !== ids.length) throw reasonApiError("NOT_FOUND", "INBOX_MESSAGE_NOT_FOUND");
    const done = rows.find(({ a }) => a.status === "ADDED");
    if (done) throw reasonApiError("CONFLICT", "INBOX_ATTACHMENT_ADDED", { code: db.dossiers.find((d) => d.id === done.a.dossierId)?.code ?? "—" });
    addDocumentFiles(db, parsed.data.dossierId, rows.map(({ a }) => ({ name: a.fileName, size: a.size })));
    for (const { a } of rows) Object.assign(a, { status: "ADDED", dossierId: parsed.data.dossierId });
    for (const m of new Set(rows.map(({ m }) => m))) if (m.attachments.every((a) => a.status === "ADDED")) m.status = "DONE";
    return { added: rows.length, dossierId: parsed.data.dossierId };
  });

/** Bỏ qua email hoặc đưa lại về "Mới". Email đã xếp xong giữ nguyên. */
export const setInboxMessageStatus = (id: string, status: Extract<InboxMessageStatus, "NEW" | "IGNORED">) =>
  mutate((db) => {
    assertCanUse(db);
    const msg = db.inboxMessages.find((m) => m.id === id);
    if (!msg) throw reasonApiError("NOT_FOUND", "INBOX_MESSAGE_NOT_FOUND");
    if (msg.status !== "DONE") msg.status = status;
    return { id, status: msg.status };
  });

/** Đường dẫn mở file đính kèm. Mock: PDF mẫu dựng tại chỗ (không có kho file thật). */
export function inboxAttachmentUrl(id: string): string {
  const db = getDb();
  const msg = db.inboxMessages.find((m) => m.attachments.some((a) => a.id === id));
  const att = msg?.attachments.find((a) => a.id === id);
  // kb-allow-raw: nội dung file PDF mẫu (dữ liệu giả lập, không phải chữ giao diện)
  const pdf = samplePdf([att?.fileName ?? id, `From: ${msg?.fromName ?? ""} <${msg?.fromEmail ?? ""}>`, `Subject: ${msg?.subject ?? ""}`, "Sample attachment (demo data)"]);
  return URL.createObjectURL(pdf);
}
