import { and, desc, eq, ilike, inArray, lte, or } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { agentRuns, catalogHs, declarations, exchangeRates, hsSuggestions, lineItems } from "../../../db/schema/declaration.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { AgentRunRow, DeclarationRepos, DeclarationRow, DeclarationUow, HsCatalogRow, HsSuggestionRow, LineItemRow } from "../application/ports.js";

function repos(tx: Tx): DeclarationRepos {
  const toItem = (r: typeof lineItems.$inferSelect): LineItemRow => ({ ...r });
  const toSug = (r: typeof hsSuggestions.$inferSelect): HsSuggestionRow => ({ ...r, rates: r.rates as HsSuggestionRow["rates"] });
  const toDecl = (r: typeof declarations.$inferSelect): DeclarationRow => ({ ...r, kind: r.kind as DeclarationRow["kind"], status: r.status as DeclarationRow["status"], fields: r.fields as DeclarationRow["fields"], valueAdjustments: r.valueAdjustments as DeclarationRow["valueAdjustments"] });
  const toRun = (r: typeof agentRuns.$inferSelect): AgentRunRow => ({ ...r, mode: r.mode as AgentRunRow["mode"], status: r.status as AgentRunRow["status"], tasks: r.tasks as AgentRunRow["tasks"], log: r.log as AgentRunRow["log"] });
  const toHs = (r: typeof catalogHs.$inferSelect): HsCatalogRow => ({ code: r.code, description: r.description, mfn: r.mfn, pref: (r.pref ?? {}) as Record<string, string>, vat: r.vat, policy: r.policy, keywords: r.keywords });
  return {
    lineItems: {
      list: async (orgId, dossierId) => (await tx.select().from(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.dossierId, dossierId))).orderBy(lineItems.lineNo)).map(toItem),
      get: async (orgId, id) => {
        const r = (await tx.select().from(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.id, id))).limit(1))[0];
        return r ? toItem(r) : null;
      },
      upsertForDossier: async (dossierId, rows) => {
        const out: LineItemRow[] = [];
        for (const r of rows) {
          const [saved] = await tx
            .insert(lineItems)
            .values(r)
            .onConflictDoUpdate({
              target: [lineItems.dossierId, lineItems.lineNo],
              set: { description: r.description, quantity: r.quantity, unit: r.unit, unitPrice: r.unitPrice, amount: r.amount, origin: r.origin, invoiceHsCode: r.invoiceHsCode, updatedAt: r.updatedAt },
            })
            .returning();
          if (saved) out.push(toItem(saved));
        }
        const keep = rows.map((r) => r.lineNo);
        const stale = (await tx.select({ id: lineItems.id, lineNo: lineItems.lineNo }).from(lineItems).where(eq(lineItems.dossierId, dossierId))).filter((x) => !keep.includes(x.lineNo));
        if (stale.length) await tx.delete(lineItems).where(inArray(lineItems.id, stale.map((s) => s.id)));
        return out.sort((a, b) => a.lineNo - b.lineNo);
      },
      update: async (id, patch) => void (await tx.update(lineItems).set(patch).where(eq(lineItems.id, id))),
    },
    suggestions: {
      listForItems: async (ids) => (ids.length ? (await tx.select().from(hsSuggestions).where(inArray(hsSuggestions.lineItemId, ids)).orderBy(desc(hsSuggestions.confidence))).map(toSug) : []),
      replaceForItem: async (itemId, rows) => {
        await tx.delete(hsSuggestions).where(eq(hsSuggestions.lineItemId, itemId));
        if (rows.length) await tx.insert(hsSuggestions).values(rows);
      },
    },
    declarations: {
      latest: async (orgId, dossierId) => {
        const r = (await tx.select().from(declarations).where(and(eq(declarations.orgId, orgId), eq(declarations.dossierId, dossierId))).orderBy(desc(declarations.version)).limit(1))[0];
        return r ? toDecl(r) : null;
      },
      listLatestByStatus: async (orgId, statuses) => {
        const rows = (await tx.select().from(declarations).where(eq(declarations.orgId, orgId)).orderBy(desc(declarations.version))).map(toDecl);
        const latest = new Map<string, DeclarationRow>();
        for (const r of rows) if (!latest.has(r.dossierId)) latest.set(r.dossierId, r);
        return [...latest.values()].filter((r) => statuses.includes(r.status));
      },
      insert: async (row) => void (await tx.insert(declarations).values(row)),
      update: async (id, patch) => void (await tx.update(declarations).set(patch).where(eq(declarations.id, id))),
    },
    agentRuns: {
      latest: async (orgId, dossierId) => {
        const r = (await tx.select().from(agentRuns).where(and(eq(agentRuns.orgId, orgId), eq(agentRuns.dossierId, dossierId))).orderBy(desc(agentRuns.startedAt)).limit(1))[0];
        return r ? toRun(r) : null;
      },
      get: async (orgId, id) => {
        const r = (await tx.select().from(agentRuns).where(and(eq(agentRuns.orgId, orgId), eq(agentRuns.id, id))).limit(1))[0];
        return r ? toRun(r) : null;
      },
      insert: async (row) => void (await tx.insert(agentRuns).values(row)),
      update: async (id, patch) => void (await tx.update(agentRuns).set(patch).where(eq(agentRuns.id, id))),
    },
    catalogHs: {
      search: async (q, limit) => {
        const needle = q?.trim();
        const where = needle ? or(ilike(catalogHs.code, `%${needle}%`), ilike(catalogHs.description, `%${needle}%`)) : undefined;
        return (await tx.select().from(catalogHs).where(where).orderBy(catalogHs.code).limit(limit)).map(toHs);
      },
      get: async (code) => {
        const r = (await tx.select().from(catalogHs).where(eq(catalogHs.code, code)).limit(1))[0];
        return r ? toHs(r) : null;
      },
      all: async () => (await tx.select().from(catalogHs).orderBy(catalogHs.code)).map(toHs),
    },
    exchangeRates: {
      latest: async (currency, date) => {
        const r = (await tx.select().from(exchangeRates).where(and(eq(exchangeRates.currency, currency), eq(exchangeRates.active, true), lte(exchangeRates.date, date))).orderBy(desc(exchangeRates.date)).limit(1))[0];
        return r ? { rate: r.rate, date: r.date } : null;
      },
    },
  };
}

export class DrizzleDeclarationUow implements DeclarationUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: DeclarationRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
