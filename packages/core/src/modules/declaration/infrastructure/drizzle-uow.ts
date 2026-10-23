import { and, desc, eq, ilike, inArray, lt, lte, or } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { agentRuns, catalogHs, declarationProfiles, declarations, exchangeRates, hsJobs, hsSuggestions, lineItems, productCatalog } from "../../../db/schema/declaration.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { AgentRunRow, DeclarationRepos, DeclarationRow, DeclarationUow, HsCatalogRow, HsJobRow, HsSuggestionRow, LineItemRow, ProductRow, ProfileRow } from "../application/ports.js";

function repos(tx: Tx): DeclarationRepos {
  const toItem = (r: typeof lineItems.$inferSelect): LineItemRow => ({ ...r, hsStatus: r.hsStatus as LineItemRow["hsStatus"], hsQuestion: r.hsQuestion as LineItemRow["hsQuestion"], hsError: r.hsError as LineItemRow["hsError"], hsDetail: r.hsDetail as LineItemRow["hsDetail"] });
  const toJob = (r: typeof hsJobs.$inferSelect): HsJobRow => ({ ...r, status: r.status as HsJobRow["status"] });
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
      findByHsItem: async (orgId, hsItemId) => {
        const r = (await tx.select().from(lineItems).where(and(eq(lineItems.orgId, orgId), eq(lineItems.hsItemId, hsItemId))).limit(1))[0];
        return r ? toItem(r) : null;
      },
    },
    hsJobs: {
      insert: async (row) => void (await tx.insert(hsJobs).values(row)),
      get: async (orgId, id) => {
        const r = (await tx.select().from(hsJobs).where(and(eq(hsJobs.orgId, orgId), eq(hsJobs.id, id))).limit(1))[0];
        return r ? toJob(r) : null;
      },
      openForDossier: async (orgId, dossierId) => (await tx.select().from(hsJobs).where(and(eq(hsJobs.orgId, orgId), eq(hsJobs.dossierId, dossierId), inArray(hsJobs.status, ["pending", "processing", "need_info"]))).orderBy(hsJobs.createdAt)).map(toJob),
      update: async (id, patch) => void (await tx.update(hsJobs).set(patch).where(eq(hsJobs.id, id))),
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
      // Bản mới nhất của mỗi hồ sơ lấy bằng DISTINCT ON trong DB (không kéo mọi phiên bản về); chặn trên 2.000 hồ sơ.
      listLatestByStatus: async (orgId, statuses) =>
        (await tx.selectDistinctOn([declarations.dossierId]).from(declarations).where(eq(declarations.orgId, orgId)).orderBy(declarations.dossierId, desc(declarations.version)).limit(2000))
          .map(toDecl)
          .filter((r) => statuses.includes(r.status))
          .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0)),
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
      listRunningBefore: async (orgId, before) => (await tx.select().from(agentRuns).where(and(eq(agentRuns.orgId, orgId), eq(agentRuns.status, "RUNNING"), lt(agentRuns.startedAt, before))).orderBy(agentRuns.startedAt).limit(200)).map(toRun),
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
    profiles: {
      get: async (orgId, direction) => {
        const r = (await tx.select().from(declarationProfiles).where(and(eq(declarationProfiles.orgId, orgId), eq(declarationProfiles.direction, direction))).limit(1))[0];
        return r ? { id: r.id, orgId: r.orgId, direction: r.direction as ProfileRow["direction"], values: r.values as ProfileRow["values"], overrides: r.overrides as ProfileRow["overrides"], updatedBy: r.updatedBy, updatedAt: r.updatedAt } : null;
      },
      upsert: async (row) => {
        await tx.insert(declarationProfiles).values({ id: row.id, orgId: row.orgId, direction: row.direction, values: row.values, overrides: row.overrides, updatedBy: row.updatedBy, updatedAt: row.updatedAt })
          .onConflictDoUpdate({ target: [declarationProfiles.orgId, declarationProfiles.direction], set: { values: row.values, overrides: row.overrides, updatedBy: row.updatedBy, updatedAt: row.updatedAt } });
      },
    },
    products: {
      // Chặn trên 2.000 mặt hàng cho màn danh mục (lọc phía client); vượt → phân trang server (BACKEND-TODO R6b).
      list: async (orgId) => (await tx.select().from(productCatalog).where(eq(productCatalog.orgId, orgId)).orderBy(desc(productCatalog.updatedAt)).limit(2000)).map(toProduct),
      get: async (orgId, id) => {
        const r = (await tx.select().from(productCatalog).where(and(eq(productCatalog.orgId, orgId), eq(productCatalog.id, id))).limit(1))[0];
        return r ? toProduct(r) : null;
      },
      byKeys: async (orgId, keys) => (keys.length ? (await tx.select().from(productCatalog).where(and(eq(productCatalog.orgId, orgId), inArray(productCatalog.key, keys)))).map(toProduct) : []),
      byNameKeys: async (orgId, nameKeys) => (nameKeys.length ? (await tx.select().from(productCatalog).where(and(eq(productCatalog.orgId, orgId), inArray(productCatalog.nameKey, nameKeys)))).map(toProduct) : []),
      insert: async (rows) => {
        // Chia lô: một câu INSERT tối đa ~65k tham số (30 cột/dòng).
        for (let i = 0; i < rows.length; i += 500) await tx.insert(productCatalog).values(rows.slice(i, i + 500));
      },
      update: async (row) => {
        const { id, orgId, createdAt: _c, ...rest } = row;
        await tx.update(productCatalog).set(rest).where(and(eq(productCatalog.orgId, orgId), eq(productCatalog.id, id)));
      },
      remove: async (orgId, ids) => (await tx.delete(productCatalog).where(and(eq(productCatalog.orgId, orgId), inArray(productCatalog.id, ids))).returning({ id: productCatalog.id })).length,
    },
    exchangeRates: {
      latest: async (currency, date) => {
        const r = (await tx.select().from(exchangeRates).where(and(eq(exchangeRates.currency, currency), eq(exchangeRates.active, true), lte(exchangeRates.date, date))).orderBy(desc(exchangeRates.date)).limit(1))[0];
        return r ? { rate: r.rate, date: r.date, source: r.source as "VCB" | "MANUAL" | "SEED", snapshotAt: r.snapshotAt } : null;
      },
    },
  };
}

function toProduct(r: typeof productCatalog.$inferSelect): ProductRow {
  return { ...r, source: r.source as ProductRow["source"], raw: (r.raw as ProductRow["raw"]) ?? null };
}

export class DrizzleDeclarationUow implements DeclarationUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: DeclarationRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
