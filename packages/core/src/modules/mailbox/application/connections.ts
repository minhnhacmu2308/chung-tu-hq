// Kết nối hộp thư Gmail / Outlook (OAuth 2.0, chỉ quyền đọc) và lấy thư theo yêu cầu.
// Token lưu mã hóa (AES-256-GCM) trong mail_connections; không bao giờ trả ra API.
import { INBOX_FIRST_SYNC_DAYS, inboxFileAccepted, type MailboxOverview, type MailConnection, type MailProvider, type MailSyncResult, type StartMailConnectResult } from "@kb/contracts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { reasonError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { MailAuthError, type InboxAttachmentRow, type MailboxDeps, type MailConnectionRow, type MailTokens } from "./ports.js";

/** Mọi thành viên trừ Người xem được kết nối hộp thư của mình và lấy thư. */
const canUse = (ctx: Ctx) => requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
const STATE_TTL_MS = 10 * 60_000;
/** Mỗi lần lấy tối đa bấy nhiêu email (cũ nhất trước); còn nữa thì lần sau lấy tiếp từ email mới nhất của lô. */
export const SYNC_BATCH = 100;

const TokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string().nullable(), expiresAt: z.string() });
const sysCtx = (orgId: string) => ({ orgId: asOrgId(orgId), userId: asUserId("") });

function toDto(r: MailConnectionRow, names: Record<string, string>): MailConnection {
  return {
    id: r.id, provider: r.provider, email: r.email, status: r.status, lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null, lastSyncCount: r.lastSyncCount,
    lastError: r.lastError, connectedBy: r.connectedBy, connectedByName: names[r.connectedBy] ?? "—", createdAt: r.createdAt.toISOString(),
  };
}

export async function getMailboxOverview(deps: MailboxDeps, ctx: Ctx): Promise<Result<MailboxOverview>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.connections.list(ctx.orgId));
  const names = await deps.members.names(ctx.orgId, [...new Set(rows.map((r) => r.connectedBy))]);
  return ok({
    providers: (["GMAIL", "OUTLOOK"] as const).map((p) => ({ provider: p, configured: deps.providers[p].configured && !!deps.cipher })),
    connections: rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((r) => toDto(r, names)),
  });
}

/** Bước 1: URL trang đồng ý của Google / Microsoft, kèm state ký HMAC (10 phút, gắn người đang đăng nhập). */
export async function startMailConnect(deps: MailboxDeps, ctx: Ctx, provider: MailProvider): Promise<Result<StartMailConnectResult>> {
  const allowed = canUse(ctx);
  if (!allowed.ok) return allowed;
  const adapter = deps.providers[provider];
  if (!adapter.configured || !deps.cipher) return err(reasonError("INTEGRATION_NOT_CONFIGURED", "MAILBOX_NOT_CONFIGURED", { provider: provider === "GMAIL" ? "Gmail" : "Outlook" }));
  const state = deps.state.sign({ orgId: ctx.orgId, userId: ctx.userId, provider, exp: deps.clock.now().getTime() + STATE_TTL_MS, nonce: deps.idGen.next("mcn") });
  return ok({ url: adapter.authorizeUrl(state, deps.redirectUri) });
}

/** Bước 2 (callback OAuth): đổi code lấy token, lưu mã hóa. Kết nối lại cùng hộp thư → thay token, trạng thái về bình thường. */
export async function completeMailConnect(deps: MailboxDeps, ctx: Ctx, input: { code: string; state: string }): Promise<Result<MailConnection>> {
  const allowed = canUse(ctx);
  if (!allowed.ok) return allowed;
  const st = deps.state.verify(input.state);
  const now = deps.clock.now();
  if (!st || st.exp < now.getTime() || st.orgId !== ctx.orgId || st.userId !== ctx.userId) return err(reasonError("VALIDATION", "MAILBOX_STATE_INVALID"));
  const adapter = deps.providers[st.provider];
  if (!adapter.configured || !deps.cipher) return err(reasonError("INTEGRATION_NOT_CONFIGURED", "MAILBOX_NOT_CONFIGURED", { provider: st.provider === "GMAIL" ? "Gmail" : "Outlook" }));
  let exchanged: Awaited<ReturnType<typeof adapter.exchangeCode>>;
  try {
    exchanged = await adapter.exchangeCode(input.code, deps.redirectUri);
  } catch {
    return err(reasonError("GATEWAY_ERROR", "MAILBOX_AUTH_FAILED"));
  }
  const email = exchanged.email.trim().toLowerCase();
  const sealed = deps.cipher.encrypt(JSON.stringify(exchanged.tokens));
  const row = await deps.uow.asOrg(ctx, async (r) => {
    const cur = await r.connections.find(ctx.orgId, st.provider, email);
    if (cur) {
      // Kết nối lại: Google chỉ trả refresh token ở lần đồng ý đầu → giữ refresh token cũ nếu lần này không có.
      const prev = TokensSchema.parse(JSON.parse(deps.cipher!.decrypt(cur.ciphertext, cur.keyVersion)) as unknown);
      const tokens: MailTokens = { ...exchanged.tokens, refreshToken: exchanged.tokens.refreshToken ?? prev.refreshToken };
      const next: MailConnectionRow = { ...cur, ...deps.cipher!.encrypt(JSON.stringify(tokens)), status: "ACTIVE", lastError: null, connectedBy: ctx.userId, updatedAt: now };
      await r.connections.update(next);
      return next;
    }
    const created: MailConnectionRow = {
      id: deps.idGen.next("mcn"), orgId: ctx.orgId, provider: st.provider, email, ...sealed, status: "ACTIVE", lastSyncedAt: null, lastSyncCount: 0, lastError: null,
      connectedBy: ctx.userId, createdAt: now, updatedAt: now,
    };
    await r.connections.insert(created);
    return created;
  });
  return ok(toDto(row, await deps.members.names(ctx.orgId, [row.connectedBy])));
}

/** Gỡ kết nối: người đã kết nối hoặc Quản trị / Chủ sở hữu. Email đã lấy vẫn ở hộp thư chứng từ. */
export async function disconnectMailbox(deps: MailboxDeps, ctx: Ctx, id: string): Promise<Result<{ removed: true }>> {
  const allowed = canUse(ctx);
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const cur = await r.connections.get(ctx.orgId, id);
    if (!cur) return err(reasonError("NOT_FOUND", "MAILBOX_NOT_FOUND"));
    if (cur.connectedBy !== ctx.userId && ctx.role !== "ADMIN" && ctx.role !== "OWNER") return err(reasonError("FORBIDDEN", "MAILBOX_NOT_FOUND"));
    await r.connections.remove(ctx.orgId, id);
    return ok({ removed: true as const });
  });
}

/** Nút "Lấy chứng từ mới": xếp lịch lấy thư cho mọi hộp thư (hoặc một hộp thư) còn dùng được. */
export async function requestMailSync(deps: MailboxDeps, ctx: Ctx, connectionId?: string): Promise<Result<MailSyncResult>> {
  const allowed = canUse(ctx);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const targets = await deps.uow.asOrg(ctx, async (r) => {
    const list = (await r.connections.list(ctx.orgId)).filter((c) => (connectionId ? c.id === connectionId : true) && c.status !== "REAUTH" && c.status !== "SYNCING");
    for (const c of list) await r.connections.update({ ...c, status: "SYNCING", updatedAt: now });
    return list;
  });
  if (connectionId && !targets.length) {
    const cur = await deps.uow.asOrg(ctx, (r) => r.connections.get(ctx.orgId, connectionId));
    if (!cur) return err(reasonError("NOT_FOUND", "MAILBOX_NOT_FOUND"));
  }
  for (const c of targets) await deps.queue.enqueue("mailbox-sync", { orgId: ctx.orgId, connectionId: c.id }, { jobId: `mailsync:${c.id}:${now.getTime()}` });
  return ok({ queued: targets.length });
}

export const MailboxSyncPayload = z.object({ orgId: z.string().min(1), connectionId: z.string().min(1) });
export type MailboxSyncPayload = z.infer<typeof MailboxSyncPayload>;

/**
 * Job lấy thư (worker): làm mới token khi sắp hết hạn → lấy email từ mốc lần trước (lần đầu: 30 ngày) → bỏ email đã có
 * (theo mã email của nhà cung cấp) → tải file đính kèm hợp lệ vào kho → ghi vào hộp thư chứng từ. Lấy hết → mốc = lúc bắt đầu;
 * đủ SYNC_BATCH email → mốc = email mới nhất của lô (lần sau lấy tiếp, email trùng mốc bị bỏ nhờ chống trùng).
 * Token bị thu hồi → REAUTH; lỗi khác → ERROR (bấm lấy lại được; email đã ghi không bị lấy lại).
 */
export async function syncMailConnection(deps: MailboxDeps, input: MailboxSyncPayload): Promise<{ added: number; status: MailConnectionRow["status"] }> {
  const ctx = sysCtx(input.orgId);
  const conn = await deps.uow.asOrg(ctx, (r) => r.connections.get(input.orgId, input.connectionId));
  if (!conn || !deps.cipher) return { added: 0, status: conn?.status ?? "ERROR" };
  const cipher = deps.cipher;
  const adapter = deps.providers[conn.provider];
  const startedAt = deps.clock.now();
  const finish = async (patch: Partial<MailConnectionRow>) => {
    const cur = await deps.uow.asOrg(ctx, (r) => r.connections.get(input.orgId, input.connectionId));
    if (cur) await deps.uow.asOrg(ctx, (r) => r.connections.update({ ...cur, ...patch, updatedAt: deps.clock.now() }));
  };
  try {
    let tokens = TokensSchema.parse(JSON.parse(cipher.decrypt(conn.ciphertext, conn.keyVersion)) as unknown);
    if (new Date(tokens.expiresAt).getTime() - startedAt.getTime() < 60_000) {
      tokens = await adapter.refresh(tokens);
      const sealed = cipher.encrypt(JSON.stringify(tokens));
      await finish(sealed);
    }
    const since = conn.lastSyncedAt ?? new Date(startedAt.getTime() - INBOX_FIRST_SYNC_DAYS * 86_400_000);
    const remote = await adapter.listMessages(tokens, since, SYNC_BATCH);
    const known = await deps.uow.asOrg(ctx, (r) => r.messages.existingProviderIds(input.orgId, conn.id, remote.map((m) => m.id)));
    let added = 0;
    for (const m of remote) {
      if (known.has(m.id)) continue;
      const files = m.attachments.filter((a) => inboxFileAccepted(a.fileName, a.size));
      if (!files.length) continue;
      const messageId = deps.idGen.next("imsg");
      const attachments: InboxAttachmentRow[] = [];
      for (const a of files) {
        const bytes = await adapter.getAttachment(tokens, m.id, a.id);
        if (!inboxFileAccepted(a.fileName, bytes.length)) continue;
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const id = deps.idGen.next("iatt");
        const ext = a.fileName.toLowerCase().split(".").pop()!;
        const storageKey = `orgs/${input.orgId}/inbox/${id}/${sha256}.${ext}`;
        await deps.storage.put(storageKey, bytes, a.mime);
        attachments.push({
          id, orgId: input.orgId, messageId, fileName: a.fileName.slice(0, 255), mime: a.mime, size: bytes.length, sha256, storageKey, kindGuess: deps.dossiers.guessKind(a.fileName),
          status: "PENDING" as const, dossierId: null, addedBy: null, addedAt: null, createdAt: startedAt,
        });
      }
      if (!attachments.length) continue;
      await deps.uow.asOrg(ctx, async (r) => {
        await r.messages.insert({
          id: messageId, orgId: input.orgId, connectionId: conn.id, provider: conn.provider, mailbox: conn.email, providerMessageId: m.id, fromName: m.fromName.slice(0, 255),
          fromEmail: m.fromEmail.slice(0, 320), subject: m.subject.slice(0, 500), snippet: m.snippet.slice(0, 500), receivedAt: m.receivedAt, status: "NEW", createdAt: startedAt, updatedAt: startedAt,
        });
        await r.attachments.insert(attachments);
      });
      added++;
    }
    const newest = remote.reduce<Date | null>((a, m) => (!a || m.receivedAt > a ? m.receivedAt : a), null);
    const mark = remote.length < SYNC_BATCH || !newest ? startedAt : newest;
    await finish({ status: "ACTIVE", lastError: null, lastSyncCount: added, lastSyncedAt: mark });
    return { added, status: "ACTIVE" };
  } catch (e) {
    const reauth = e instanceof MailAuthError;
    await finish({ status: reauth ? "REAUTH" : "ERROR", lastError: reauth ? "MAILBOX_REAUTH_REQUIRED" : "MAILBOX_SYNC_FAILED" });
    return { added: 0, status: reauth ? "REAUTH" : "ERROR" };
  }
}
