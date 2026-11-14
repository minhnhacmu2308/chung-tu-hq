import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { catalogImports, catalogItems, catalogMatchQueue, catalogSettings, codeSetOwners, codeSets, itemAliases, itemUnitConversions } from "../../../db/schema/catalog.js";
import { drizzleFieldAudit } from "../../../db/field-audit.js";
import { drizzleCatalogLineFactors } from "../../../db/catalog-line-factors.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { Decimal } from "../../../shared/decimal.js";
import type { CatalogRepos, CatalogUow, MatchQueueRow } from "../application/ports.js";
import { formatItemNo } from "../domain/item-no.js";


/** numeric(24,9) đọc ra "12.500000000" → chuỗi Decimal gọn "12.5" (điền sẵn ô hệ số). */
const toQueueRow = (r: typeof catalogMatchQueue.$inferSelect): MatchQueueRow => ({ ...r, factor: r.factor === null ? null : new Decimal(r.factor).toFixed() });

function repos(tx: Tx): CatalogRepos {
  return {
    settings: {
      get: async (orgId) => (await tx.select().from(catalogSettings).where(eq(catalogSettings.orgId, orgId)).limit(1))[0] ?? null,
      upsert: async (orgId, patch, now) => {
        const set = { ...patch, updatedAt: now };
        const r = await tx
          .insert(catalogSettings)
          .values({ orgId, ...patch, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: catalogSettings.orgId, set })
          .returning();
        return r[0]!;
      },
      nextItemNo: async (orgId) => {
        await tx.insert(catalogSettings).values({ orgId }).onConflictDoNothing();
        const r = await tx
          .update(catalogSettings)
          .set({ itemNoSeq: sql`${catalogSettings.itemNoSeq} + 1` })
          .where(eq(catalogSettings.orgId, orgId))
          .returning({ prefix: catalogSettings.itemNoPrefix, seq: catalogSettings.itemNoSeq });
        return formatItemNo(r[0]!.prefix, r[0]!.seq);
      },
    },
    items: {
      get: async (orgId, id) => (await tx.select().from(catalogItems).where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, id))).limit(1))[0] ?? null,
      getMany: async (orgId, ids) => (ids.length ? await tx.select().from(catalogItems).where(and(eq(catalogItems.orgId, orgId), inArray(catalogItems.id, ids))) : []),
      findByItemNo: async (orgId, itemNo) => (await tx.select().from(catalogItems).where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.itemNo, itemNo))).limit(1))[0] ?? null,
      resolveMerged: async (orgId, id) => {
        const seen = new Set<string>();
        let cur: string | null = id;
        while (cur !== null) {
          if (seen.has(cur)) return null;
          seen.add(cur);
          const row: typeof catalogItems.$inferSelect | undefined = (await tx.select().from(catalogItems).where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, cur))).limit(1))[0];
          if (!row) return null;
          if (row.status !== "MERGED" || row.mergedIntoId === null) return row;
          cur = row.mergedIntoId;
        }
        return null;
      },
      list: async (orgId, filter) => tx.select().from(catalogItems).where(and(eq(catalogItems.orgId, orgId), filter?.status ? eq(catalogItems.status, filter.status) : undefined)).orderBy(asc(catalogItems.itemNo)),
      insert: async (row) => void (await tx.insert(catalogItems).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(catalogItems).set(patch).where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, id)))),
      incrementDeclared: async (orgId, id, patch) =>
        void (await tx.update(catalogItems).set({ ...patch, timesDeclared: sql`${catalogItems.timesDeclared} + 1` }).where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, id)))),
      recordDeclarationNo: async (orgId, id, declarationNo, date, now) =>
        (await tx
          .update(catalogItems)
          .set({ lastDeclarationNo: declarationNo, lastDeclarationDate: date, updatedAt: now })
          .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, id), or(isNull(catalogItems.lastDeclarationDate), lte(catalogItems.lastDeclarationDate, date))))
          .returning({ id: catalogItems.id })).length > 0,
      lockForUpdate: async (orgId, ids) => {
        if (ids.length) await tx.select({ id: catalogItems.id }).from(catalogItems).where(and(eq(catalogItems.orgId, orgId), inArray(catalogItems.id, ids))).orderBy(asc(catalogItems.id)).for("update");
      },
      markMerged: async (orgId, id, intoId, by, at) =>
        (await tx.update(catalogItems).set({ status: "MERGED", mergedIntoId: intoId, updatedBy: by, updatedAt: at }).where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.id, id), ne(catalogItems.status, "MERGED"))).returning({ id: catalogItems.id })).length > 0,
    },
    codeSets: {
      get: async (orgId, id) => (await tx.select().from(codeSets).where(and(eq(codeSets.orgId, orgId), eq(codeSets.id, id))).limit(1))[0] ?? null,
      list: async (orgId) => tx.select().from(codeSets).where(eq(codeSets.orgId, orgId)).orderBy(asc(codeSets.createdAt), asc(codeSets.id)),
      insert: async (row) => void (await tx.insert(codeSets).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(codeSets).set(patch).where(and(eq(codeSets.orgId, orgId), eq(codeSets.id, id)))),
    },
    owners: {
      list: async (orgId, codeSetId) => (await tx.select({ userId: codeSetOwners.userId }).from(codeSetOwners).where(and(eq(codeSetOwners.orgId, orgId), eq(codeSetOwners.codeSetId, codeSetId))).orderBy(asc(codeSetOwners.userId))).map((r) => r.userId),
      replace: async (orgId, codeSetId, userIds) => {
        await tx.delete(codeSetOwners).where(and(eq(codeSetOwners.orgId, orgId), eq(codeSetOwners.codeSetId, codeSetId)));
        const uniq = [...new Set(userIds)];
        if (uniq.length) await tx.insert(codeSetOwners).values(uniq.map((userId) => ({ orgId, codeSetId, userId })));
      },
      isOwner: async (orgId, codeSetId, userId) => (await tx.select({ u: codeSetOwners.userId }).from(codeSetOwners).where(and(eq(codeSetOwners.orgId, orgId), eq(codeSetOwners.codeSetId, codeSetId), eq(codeSetOwners.userId, userId))).limit(1)).length > 0,
    },
    aliases: {
      get: async (orgId, id) => (await tx.select().from(itemAliases).where(and(eq(itemAliases.orgId, orgId), eq(itemAliases.id, id))).limit(1))[0] ?? null,
      findActive: async (orgId, codeSetId, codeKey) => (await tx.select().from(itemAliases).where(and(eq(itemAliases.orgId, orgId), eq(itemAliases.codeSetId, codeSetId), eq(itemAliases.codeKey, codeKey), eq(itemAliases.status, "ACTIVE"))).limit(1))[0] ?? null,
      listActiveByCodeKey: async (orgId, codeKey) => tx.select().from(itemAliases).where(and(eq(itemAliases.orgId, orgId), eq(itemAliases.codeKey, codeKey), eq(itemAliases.status, "ACTIVE"))).orderBy(asc(itemAliases.createdAt), asc(itemAliases.id)),
      listForItem: async (orgId, itemId) => tx.select().from(itemAliases).where(and(eq(itemAliases.orgId, orgId), eq(itemAliases.itemId, itemId))).orderBy(asc(itemAliases.createdAt), asc(itemAliases.id)),
      listForItems: async (orgId, itemIds) => (itemIds.length ? tx.select().from(itemAliases).where(and(eq(itemAliases.orgId, orgId), inArray(itemAliases.itemId, itemIds))).orderBy(asc(itemAliases.createdAt), asc(itemAliases.id)) : []),
      listForCodeSet: async (orgId, codeSetId, filter) => tx.select().from(itemAliases).where(and(eq(itemAliases.orgId, orgId), eq(itemAliases.codeSetId, codeSetId), filter?.status ? eq(itemAliases.status, filter.status) : undefined)).orderBy(asc(itemAliases.codeKey), asc(itemAliases.id)),
      listByOrg: async (orgId, filter) => tx.select().from(itemAliases).where(and(eq(itemAliases.orgId, orgId), filter?.status ? eq(itemAliases.status, filter.status) : undefined)).orderBy(asc(itemAliases.createdAt), asc(itemAliases.id)),
      insert: async (row) => void (await tx.insert(itemAliases).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(itemAliases).set(patch).where(and(eq(itemAliases.orgId, orgId), eq(itemAliases.id, id)))),
    },
    conversions: {
      listForItem: async (orgId, itemId) => tx.select().from(itemUnitConversions).where(and(eq(itemUnitConversions.orgId, orgId), eq(itemUnitConversions.itemId, itemId))).orderBy(asc(itemUnitConversions.unit)),
      listForItems: async (orgId, itemIds) => (itemIds.length ? tx.select().from(itemUnitConversions).where(and(eq(itemUnitConversions.orgId, orgId), inArray(itemUnitConversions.itemId, itemIds))).orderBy(asc(itemUnitConversions.itemId), asc(itemUnitConversions.unit)) : []),
      listByOrg: async (orgId) => tx.select().from(itemUnitConversions).where(eq(itemUnitConversions.orgId, orgId)).orderBy(asc(itemUnitConversions.itemId), asc(itemUnitConversions.unit)),
      upsert: async (row) => void (await tx.insert(itemUnitConversions).values(row).onConflictDoUpdate({ target: [itemUnitConversions.itemId, itemUnitConversions.unit], set: { factor: row.factor, updatedAt: row.updatedAt } })),
      delete: async (orgId, itemId, unit) => void (await tx.delete(itemUnitConversions).where(and(eq(itemUnitConversions.orgId, orgId), eq(itemUnitConversions.itemId, itemId), eq(itemUnitConversions.unit, unit)))),
    },
    queue: {
      get: async (orgId, id) => {
        const r = (await tx.select().from(catalogMatchQueue).where(and(eq(catalogMatchQueue.orgId, orgId), eq(catalogMatchQueue.id, id))).limit(1))[0];
        return r ? toQueueRow(r) : null;
      },
      list: async (orgId, f) =>
        (
          await tx
            .select()
            .from(catalogMatchQueue)
            .where(and(eq(catalogMatchQueue.orgId, orgId), f?.status ? eq(catalogMatchQueue.status, f.status) : undefined, f?.codeSetId ? eq(catalogMatchQueue.codeSetId, f.codeSetId) : undefined, f?.importId ? eq(catalogMatchQueue.importId, f.importId) : undefined))
            .orderBy(asc(catalogMatchQueue.createdAt), asc(catalogMatchQueue.id))
        ).map(toQueueRow),
      insert: async (row) => void (await tx.insert(catalogMatchQueue).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(catalogMatchQueue).set(patch).where(and(eq(catalogMatchQueue.orgId, orgId), eq(catalogMatchQueue.id, id)))),
      claim: async (orgId, id, patch) =>
        (await tx.update(catalogMatchQueue).set(patch).where(and(eq(catalogMatchQueue.orgId, orgId), eq(catalogMatchQueue.id, id), eq(catalogMatchQueue.status, "PENDING"))).returning({ id: catalogMatchQueue.id })).length > 0,
    },
    imports: {
      get: async (orgId, id) => (await tx.select().from(catalogImports).where(and(eq(catalogImports.orgId, orgId), eq(catalogImports.id, id))).limit(1))[0] ?? null,
      getForUpdate: async (orgId, id) => (await tx.select().from(catalogImports).where(and(eq(catalogImports.orgId, orgId), eq(catalogImports.id, id))).limit(1).for("update"))[0] ?? null,
      list: async (orgId) => tx.select().from(catalogImports).where(eq(catalogImports.orgId, orgId)).orderBy(desc(catalogImports.createdAt), desc(catalogImports.id)),
      insert: async (row) => void (await tx.insert(catalogImports).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(catalogImports).set(patch).where(and(eq(catalogImports.orgId, orgId), eq(catalogImports.id, id)))),
      bumpCounts: async (orgId, id, d, now) => {
        const k = (name: "created" | "matched" | "queued" | "skipped" | "errors") => sql`greatest(0, coalesce((${catalogImports.counts}->>${name})::int, 0) + ${Math.trunc(d[name] ?? 0)})`;
        await tx
          .update(catalogImports)
          .set({ counts: sql`jsonb_build_object('created', ${k("created")}, 'matched', ${k("matched")}, 'queued', ${k("queued")}, 'skipped', ${k("skipped")}, 'errors', ${k("errors")})`, updatedAt: now })
          .where(and(eq(catalogImports.orgId, orgId), eq(catalogImports.id, id)));
      },
    },
    lineFactors: drizzleCatalogLineFactors(tx),
    fieldAudit: drizzleFieldAudit(tx),
  };
}

export class DrizzleCatalogUow implements CatalogUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CatalogRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
