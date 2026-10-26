// Hộp thư chứng từ: email lấy về kèm file đính kèm, gợi ý hồ sơ khớp; người dùng xếp file vào hồ sơ hoặc bỏ qua email.
import type { AddInboxToDossierInput, AddInboxToDossierResult, InboxMessage, InboxMessageStatus } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { suggestDossier } from "../domain/suggest.js";
import type { InboxAttachmentRow, InboxMessageRow, MailboxDeps } from "./ports.js";

/** Xếp file vào hồ sơ = tải chứng từ → cùng quyền tải tay. */
const canFile = (ctx: Ctx) => requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");

export async function listInbox(deps: MailboxDeps, ctx: Ctx): Promise<Result<InboxMessage[]>> {
  const { messages, attachments } = await deps.uow.asOrg(ctx, async (r) => {
    const messages = (await r.messages.list(ctx.orgId)).filter((m) => m.status !== "DELETED");
    return { messages, attachments: await r.attachments.listByMessages(ctx.orgId, messages.map((m) => m.id)) };
  });
  const dossiers = await deps.dossiers.list(ctx.orgId);
  const codeOf = new Map(dossiers.map((d) => [d.id, d.code]));
  const byMsg = new Map<string, InboxAttachmentRow[]>();
  for (const a of attachments) byMsg.set(a.messageId, [...(byMsg.get(a.messageId) ?? []), a]);
  return ok(
    messages
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .map((m) => {
        const files = (byMsg.get(m.id) ?? []).sort((a, b) => a.fileName.localeCompare(b.fileName));
        return {
          id: m.id, connectionId: m.connectionId, provider: m.provider, mailbox: m.mailbox, fromName: m.fromName, fromEmail: m.fromEmail, subject: m.subject, snippet: m.snippet,
          receivedAt: m.receivedAt.toISOString(), status: m.status as InboxMessageStatus,
          attachments: files.map((a) => ({
            id: a.id, fileName: a.fileName, mime: a.mime, size: a.size, kindGuess: a.kindGuess, status: a.status, dossierId: a.dossierId, dossierCode: a.dossierId ? (codeOf.get(a.dossierId) ?? null) : null,
          })),
          suggestion: m.status === "NEW" ? suggestDossier({ subject: m.subject, fromName: m.fromName, fromEmail: m.fromEmail, fileNames: files.map((f) => f.fileName) }, dossiers) : null,
        };
      }),
  );
}

/**
 * Đưa file đã chọn vào hồ sơ (đi tiếp luồng tải chứng từ: kiểm tra file, quota trang, AI đọc). File đã vào hồ sơ không thêm lại.
 * Email hết file chờ → "Đã xếp".
 */
export async function addInboxToDossier(deps: MailboxDeps, ctx: Ctx, input: AddInboxToDossierInput): Promise<Result<AddInboxToDossierResult>> {
  const allowed = canFile(ctx);
  if (!allowed.ok) return allowed;
  const ids = [...new Set(input.attachmentIds)];
  const rows = await deps.uow.asOrg(ctx, (r) => r.attachments.byIds(ctx.orgId, ids));
  if (rows.length !== ids.length) return err(reasonError("NOT_FOUND", "INBOX_MESSAGE_NOT_FOUND"));
  const done = rows.find((a) => a.status === "ADDED");
  if (done) {
    const code = (await deps.dossiers.list(ctx.orgId)).find((d) => d.id === done.dossierId)?.code ?? "—";
    return err(reasonError("CONFLICT", "INBOX_ATTACHMENT_ADDED", { code }));
  }
  const files = await Promise.all(rows.map(async (a) => ({ name: a.fileName, mime: a.mime, bytes: await deps.storage.get(a.storageKey) })));
  const added = await deps.dossiers.addFiles(ctx, input.dossierId, files);
  if (!added.ok) return added;
  const now = deps.clock.now();
  await deps.uow.asOrg(ctx, async (r) => {
    for (const a of rows) await r.attachments.update({ ...a, status: "ADDED", dossierId: input.dossierId, addedBy: ctx.userId, addedAt: now });
    for (const messageId of new Set(rows.map((a) => a.messageId))) {
      const all = await r.attachments.listByMessages(ctx.orgId, [messageId]);
      const msg = await r.messages.get(ctx.orgId, messageId);
      if (msg && all.every((a) => a.status === "ADDED") && msg.status !== "DONE") await r.messages.update({ ...msg, status: "DONE", updatedAt: now });
    }
  });
  return ok({ added: rows.length, dossierId: input.dossierId });
}

/** Bỏ qua email (không có chứng từ cần khai) hoặc đưa lại về "Mới". */
export async function setInboxMessageStatus(deps: MailboxDeps, ctx: Ctx, id: string, status: Extract<InboxMessageStatus, "NEW" | "IGNORED">): Promise<Result<{ id: string; status: InboxMessageStatus }>> {
  const allowed = canFile(ctx);
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const msg = await r.messages.get(ctx.orgId, id);
    if (!msg || msg.status === "DELETED") return err(reasonError("NOT_FOUND", "INBOX_MESSAGE_NOT_FOUND"));
    if (msg.status === "DONE") return ok({ id, status: msg.status });
    const next: InboxMessageRow = { ...msg, status, updatedAt: deps.clock.now() };
    await r.messages.update(next);
    return ok({ id, status });
  });
}

/** Nội dung file đính kèm để xem trước (mọi thành viên của org). */
export async function getInboxAttachmentFile(deps: MailboxDeps, ctx: Ctx, id: string): Promise<Result<{ fileName: string; mime: string; bytes: Buffer }>> {
  const [a] = await deps.uow.asOrg(ctx, (r) => r.attachments.byIds(ctx.orgId, [id]));
  if (!a) return err(reasonError("NOT_FOUND", "INBOX_MESSAGE_NOT_FOUND"));
  return ok({ fileName: a.fileName, mime: a.mime, bytes: await deps.storage.get(a.storageKey) });
}

/**
 * Xóa email khỏi hộp thư chứng từ (spam, email không liên quan, đã xử lý xong). File đính kèm bị xóa khỏi kho; file đã xếp vào hồ sơ
 * vẫn còn ở hồ sơ (đã chép riêng khi xếp). Giữ một hàng đánh dấu DELETED để lần lấy thư sau không kéo lại – hộp thư gốc không bị đụng.
 */
export async function deleteInboxMessages(deps: MailboxDeps, ctx: Ctx, ids: string[]): Promise<Result<{ deleted: number }>> {
  const allowed = canFile(ctx);
  if (!allowed.ok) return allowed;
  const unique = [...new Set(ids)];
  const keys = await deps.uow.asOrg(ctx, async (r) => {
    const now = deps.clock.now();
    const found: InboxMessageRow[] = [];
    for (const id of unique) {
      const msg = await r.messages.get(ctx.orgId, id);
      if (msg && msg.status !== "DELETED") found.push(msg);
    }
    for (const msg of found) await r.messages.update({ ...msg, status: "DELETED", snippet: "", updatedAt: now });
    const files = await r.attachments.listByMessages(ctx.orgId, found.map((m) => m.id));
    return { count: found.length, keys: files.map((a) => a.storageKey) };
  });
  for (const key of keys.keys) await deps.storage.delete(key).catch(() => undefined);
  return ok({ deleted: keys.count });
}

/** Hồ sơ bị xóa hẳn → file đã xếp vào hồ sơ đó trở lại "chờ xếp", email về mục "Mới" để xếp lại. */
export async function releaseDossierAttachments(deps: MailboxDeps, ctx: Ctx | { orgId: Ctx["orgId"]; userId: Ctx["userId"] }, dossierId: string): Promise<void> {
  await deps.uow.asOrg(ctx, async (r) => {
    const rows = await r.attachments.listByDossier(ctx.orgId, dossierId);
    const now = deps.clock.now();
    for (const a of rows) await r.attachments.update({ ...a, status: "PENDING", dossierId: null, addedBy: null, addedAt: null });
    for (const messageId of new Set(rows.map((a) => a.messageId))) {
      const msg = await r.messages.get(ctx.orgId, messageId);
      if (msg?.status === "DONE") await r.messages.update({ ...msg, status: "NEW", updatedAt: now });
    }
  });
}
