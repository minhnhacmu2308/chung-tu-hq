import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { inboxAttachments, inboxMessages, mailConnections } from "../../../db/schema/mailbox.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { InboxAttachmentRow, InboxMessageRow, MailboxRepos, MailboxUow, MailConnectionRow } from "../application/ports.js";

function repos(tx: Tx): MailboxRepos {
  const toConn = (r: typeof mailConnections.$inferSelect): MailConnectionRow => ({ ...r, provider: r.provider as MailConnectionRow["provider"], status: r.status as MailConnectionRow["status"] });
  const toMsg = (r: typeof inboxMessages.$inferSelect): InboxMessageRow => ({ ...r, provider: r.provider as InboxMessageRow["provider"], status: r.status as InboxMessageRow["status"] });
  const toAtt = (r: typeof inboxAttachments.$inferSelect): InboxAttachmentRow => ({ ...r, kindGuess: r.kindGuess as InboxAttachmentRow["kindGuess"], status: r.status as InboxAttachmentRow["status"] });
  return {
    connections: {
      list: async (orgId) => (await tx.select().from(mailConnections).where(eq(mailConnections.orgId, orgId)).orderBy(mailConnections.createdAt)).map(toConn),
      get: async (orgId, id) => {
        const r = (await tx.select().from(mailConnections).where(and(eq(mailConnections.orgId, orgId), eq(mailConnections.id, id))).limit(1))[0];
        return r ? toConn(r) : null;
      },
      find: async (orgId, provider, email) => {
        const r = (await tx.select().from(mailConnections).where(and(eq(mailConnections.orgId, orgId), eq(mailConnections.provider, provider), eq(mailConnections.email, email))).limit(1))[0];
        return r ? toConn(r) : null;
      },
      insert: async (row) => void (await tx.insert(mailConnections).values(row)),
      listSyncingBefore: async (orgId, before) => (await tx.select().from(mailConnections).where(and(eq(mailConnections.orgId, orgId), eq(mailConnections.status, "SYNCING"), lt(mailConnections.updatedAt, before)))).map(toConn),
      update: async (row) => void (await tx.update(mailConnections).set(row).where(and(eq(mailConnections.orgId, row.orgId), eq(mailConnections.id, row.id)))),
      remove: async (orgId, id) => void (await tx.delete(mailConnections).where(and(eq(mailConnections.orgId, orgId), eq(mailConnections.id, id)))),
    },
    messages: {
      // Chặn trên: hộp thư là danh sách lọc phía client; email cũ hơn vẫn nằm trong DB (phân trang server: BACKEND-TODO R6b).
      list: async (orgId) => (await tx.select().from(inboxMessages).where(eq(inboxMessages.orgId, orgId)).orderBy(desc(inboxMessages.receivedAt)).limit(500)).map(toMsg),
      get: async (orgId, id) => {
        const r = (await tx.select().from(inboxMessages).where(and(eq(inboxMessages.orgId, orgId), eq(inboxMessages.id, id))).limit(1))[0];
        return r ? toMsg(r) : null;
      },
      existingProviderIds: async (orgId, connectionId, providerIds) => {
        if (!providerIds.length) return new Set();
        const rows = await tx
          .select({ id: inboxMessages.providerMessageId })
          .from(inboxMessages)
          .where(and(eq(inboxMessages.orgId, orgId), eq(inboxMessages.connectionId, connectionId), inArray(inboxMessages.providerMessageId, providerIds)));
        return new Set(rows.map((r) => r.id));
      },
      insert: async (row) => void (await tx.insert(inboxMessages).values(row)),
      update: async (row) => void (await tx.update(inboxMessages).set(row).where(and(eq(inboxMessages.orgId, row.orgId), eq(inboxMessages.id, row.id)))),
    },
    attachments: {
      listByMessages: async (orgId, messageIds) =>
        messageIds.length ? (await tx.select().from(inboxAttachments).where(and(eq(inboxAttachments.orgId, orgId), inArray(inboxAttachments.messageId, messageIds)))).map(toAtt) : [],
      byIds: async (orgId, ids) => (ids.length ? (await tx.select().from(inboxAttachments).where(and(eq(inboxAttachments.orgId, orgId), inArray(inboxAttachments.id, ids)))).map(toAtt) : []),
      listByDossier: async (orgId, dossierId) => (await tx.select().from(inboxAttachments).where(and(eq(inboxAttachments.orgId, orgId), eq(inboxAttachments.dossierId, dossierId)))).map(toAtt),
      insert: async (rows) => void (rows.length && (await tx.insert(inboxAttachments).values(rows))),
      update: async (row) => void (await tx.update(inboxAttachments).set(row).where(and(eq(inboxAttachments.orgId, row.orgId), eq(inboxAttachments.id, row.id)))),
    },
  };
}

export class DrizzleMailboxUow implements MailboxUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: MailboxRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
