import type { OrgId, UserId } from "../../../../shared/ids.js";
import type { CustomsRepos, CustomsUow, MessageRow, OutboxRow, ResultRow } from "../customs-ports.js";

/** Fake mô phỏng RLS theo org; outbox unique theo idempotency_key; messages append-only. */
export class InMemoryCustomsUow implements CustomsUow {
  readonly data = { outbox: [] as OutboxRow[], messages: [] as MessageRow[], results: [] as ResultRow[] };
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CustomsRepos) => Promise<T>): Promise<T> {
    const d = this.data;
    const org = ctx.orgId as string;
    const deny = (w: string): never => {
      throw new Error(`new row violates row-level security policy (${w})`);
    };
    const clone = <X>(x: X): X => structuredClone(x);
    return fn({
      outbox: {
        get: async (orgId, id) => clone(d.outbox.find((x) => x.id === id && x.orgId === org && x.orgId === orgId) ?? null),
        findByKey: async (orgId, key) => clone(d.outbox.find((x) => x.idempotencyKey === key && x.orgId === org && x.orgId === orgId) ?? null),
        listForDossier: async (orgId, dossierId) => clone(d.outbox.filter((x) => x.orgId === org && x.orgId === orgId && x.dossierId === dossierId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
        insert: async (row) => {
          if (row.orgId !== org) deny("customs_outbox");
          if (d.outbox.some((x) => x.idempotencyKey === row.idempotencyKey)) throw new Error("duplicate key value violates unique constraint customs_outbox_key_uq");
          d.outbox.push(clone(row));
        },
        update: async (id, patch) => {
          const x = d.outbox.find((y) => y.id === id && y.orgId === org);
          if (x) Object.assign(x, clone(patch));
        },
      },
      messages: {
        list: async (orgId, dossierId) => clone(d.messages.filter((m) => m.orgId === org && m.orgId === orgId && m.dossierId === dossierId).sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id))),
        insert: async (row) => void (row.orgId === org ? d.messages.push(clone(row)) : deny("customs_messages")),
      },
      results: {
        get: async (orgId, dossierId) => clone(d.results.find((r) => r.dossierId === dossierId && r.orgId === org && r.orgId === orgId) ?? null),
        listForOrg: async (orgId) => clone(d.results.filter((r) => r.orgId === org && r.orgId === orgId)),
        upsert: async (row) => {
          if (row.orgId !== org) deny("customs_results");
          const i = d.results.findIndex((r) => r.dossierId === row.dossierId);
          if (i >= 0) d.results[i] = clone(row);
          else d.results.push(clone(row));
        },
      },
    });
  }
}
