import { MailboxSyncPayload, syncMailConnection, type MailboxDeps } from "@kb/core/modules/mailbox";

/** Lấy thư của một hộp thư đã kết nối. Lỗi nhà cung cấp use case tự ghi lên kết nối (ERROR / REAUTH) – không ném, không thử lại. */
export async function mailboxSyncJob(deps: MailboxDeps, raw: unknown) {
  const p = MailboxSyncPayload.parse(raw);
  const r = await syncMailConnection(deps, p);
  return `${p.connectionId}: ${r.status}, ${r.added} email mới`;
}
