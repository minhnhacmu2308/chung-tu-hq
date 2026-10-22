import type { OrgId, UserId } from "../../../../shared/ids.js";
import type { InboxAttachmentRow, InboxMessageRow, MailboxRepos, MailboxUow, MailConnectionRow } from "../ports.js";

/** Fake mô phỏng RLS theo org. */
export class InMemoryMailboxUow implements MailboxUow {
  readonly data = { connections: [] as MailConnectionRow[], messages: [] as InboxMessageRow[], attachments: [] as InboxAttachmentRow[] };

  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: MailboxRepos) => Promise<T>): Promise<T> {
    const d = this.data;
    const org = ctx.orgId as string;
    const mine = <X extends { orgId: string }>(x: X, orgId: string) => x.orgId === org && x.orgId === orgId;
    const guard = (row: { orgId: string }, w: string) => {
      if (row.orgId !== org) throw new Error(`new row violates row-level security policy (${w})`);
    };
    const clone = <X>(x: X): X => structuredClone(x);
    const replace = <X extends { id: string; orgId: string }>(list: X[], row: X) => {
      const i = list.findIndex((x) => x.id === row.id && x.orgId === org);
      if (i >= 0) list[i] = clone(row);
    };
    const repos: MailboxRepos = {
      connections: {
        list: async (orgId) => clone(d.connections.filter((x) => mine(x, orgId))),
        get: async (orgId, id) => clone(d.connections.find((x) => mine(x, orgId) && x.id === id) ?? null),
        find: async (orgId, provider, email) => clone(d.connections.find((x) => mine(x, orgId) && x.provider === provider && x.email === email) ?? null),
        insert: async (row) => (guard(row, "mail_connections"), void d.connections.push(clone(row))),
        update: async (row) => (guard(row, "mail_connections"), replace(d.connections, row)),
        remove: async (orgId, id) => void (d.connections = d.connections.filter((x) => !(mine(x, orgId) && x.id === id))),
      },
      messages: {
        list: async (orgId) => clone(d.messages.filter((x) => mine(x, orgId))),
        get: async (orgId, id) => clone(d.messages.find((x) => mine(x, orgId) && x.id === id) ?? null),
        existingProviderIds: async (orgId, connectionId, ids) => new Set(d.messages.filter((x) => mine(x, orgId) && x.connectionId === connectionId && ids.includes(x.providerMessageId)).map((x) => x.providerMessageId)),
        insert: async (row) => {
          guard(row, "inbox_messages");
          if (d.messages.some((x) => x.orgId === row.orgId && x.connectionId === row.connectionId && x.providerMessageId === row.providerMessageId)) throw new Error("duplicate key inbox_messages_conn_msg_uq");
          d.messages.push(clone(row));
        },
        update: async (row) => (guard(row, "inbox_messages"), replace(d.messages, row)),
      },
      attachments: {
        listByMessages: async (orgId, ids) => clone(d.attachments.filter((x) => mine(x, orgId) && ids.includes(x.messageId))),
        byIds: async (orgId, ids) => clone(d.attachments.filter((x) => mine(x, orgId) && ids.includes(x.id))),
        insert: async (rows) => (rows.forEach((r) => guard(r, "inbox_attachments")), void d.attachments.push(...clone(rows))),
        update: async (row) => (guard(row, "inbox_attachments"), replace(d.attachments, row)),
      },
    };
    return fn(repos);
  }
}
