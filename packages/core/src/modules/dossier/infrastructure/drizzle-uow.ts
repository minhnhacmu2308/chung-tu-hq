import { and, count, desc, eq, gte, ilike, like, lt, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { documents, dossiers, jobProgress } from "../../../db/schema/dossier.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { DocumentRow, DossierListFilter, DossierRepos, DossierRow, DossierUow } from "../application/ports.js";

/** Điều kiện lọc danh sách hồ sơ (dùng chung cho list + count). `q`: mã hồ sơ / đối tác / số vận đơn, không phân biệt hoa thường; ký tự % _ của LIKE được thoát. */
function dossierWhere(orgId: string, f: DossierListFilter) {
  const q = f.q?.trim();
  const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return and(
    eq(dossiers.orgId, orgId),
    ...(f.direction ? [eq(dossiers.direction, f.direction)] : []),
    ...(f.status ? [eq(dossiers.status, f.status)] : []),
    ...(f.step ? [eq(dossiers.step, f.step)] : []),
    ...(pattern ? [or(ilike(dossiers.code, pattern), ilike(dossiers.partner, pattern), ilike(dossiers.billNo, pattern))!] : []),
  );
}

function repos(tx: Tx): DossierRepos {
  const toDossier = (d: typeof dossiers.$inferSelect): DossierRow => ({ ...d, direction: d.direction as DossierRow["direction"], status: d.status as DossierRow["status"], step: d.step as DossierRow["step"], transportMode: d.transportMode as DossierRow["transportMode"], partyClass: d.partyClass as DossierRow["partyClass"] });
  const toDocument = (d: typeof documents.$inferSelect): DocumentRow => ({ ...d, kind: d.kind as DocumentRow["kind"], kindSource: d.kindSource as DocumentRow["kindSource"], status: d.status as DocumentRow["status"] });
  return {
    dossiers: {
      list: async (orgId, f, page) => (await tx.select().from(dossiers).where(dossierWhere(orgId, f)).orderBy(desc(dossiers.updatedAt), desc(dossiers.id)).limit(page.limit).offset(page.offset)).map(toDossier),
      count: async (orgId, f) => Number((await tx.select({ n: count() }).from(dossiers).where(dossierWhere(orgId, f)))[0]?.n ?? 0),
      get: async (orgId, id) => {
        const d = (await tx.select().from(dossiers).where(and(eq(dossiers.orgId, orgId), eq(dossiers.id, id))).limit(1))[0];
        return d ? toDossier(d) : null;
      },
      codesInMonth: async (orgId, direction, prefix) => (await tx.select({ code: dossiers.code }).from(dossiers).where(and(eq(dossiers.orgId, orgId), eq(dossiers.direction, direction), like(dossiers.code, `${prefix}%`)))).map((r) => r.code),
      insert: async (row) => void (await tx.insert(dossiers).values(row)),
      update: async (id, patch) => void (await tx.update(dossiers).set(patch).where(eq(dossiers.id, id))),
      statsInRange: async (orgId, from, to) => {
        const [row] = await tx
          .select({ dossiers: sql<number>`count(distinct ${dossiers.id})::int`, pages: sql<number>`coalesce(sum(${documents.pages}), 0)::int` })
          .from(dossiers)
          .leftJoin(documents, eq(documents.dossierId, dossiers.id))
          .where(and(eq(dossiers.orgId, orgId), gte(dossiers.createdAt, from), lt(dossiers.createdAt, to)));
        return { dossiers: row?.dossiers ?? 0, pages: row?.pages ?? 0 };
      },
    },
    documents: {
      list: async (orgId, dossierId) => (await tx.select().from(documents).where(and(eq(documents.orgId, orgId), eq(documents.dossierId, dossierId))).orderBy(documents.createdAt, documents.id)).map(toDocument),
      get: async (orgId, id) => {
        const d = (await tx.select().from(documents).where(and(eq(documents.orgId, orgId), eq(documents.id, id))).limit(1))[0];
        return d ? toDocument(d) : null;
      },
      insert: async (row) => void (await tx.insert(documents).values(row)),
      update: async (id, patch) => void (await tx.update(documents).set({ ...patch, updatedAt: new Date() }).where(eq(documents.id, id))),
      delete: async (id) => void (await tx.delete(documents).where(eq(documents.id, id))),
      listStuckQueued: async (orgId, before) => (await tx.select().from(documents).where(and(eq(documents.orgId, orgId), eq(documents.status, "QUEUED"), lt(documents.updatedAt, before))).orderBy(documents.updatedAt).limit(200)).map(toDocument),
    },
    progress: {
      upsert: async (row) => {
        await tx
          .insert(jobProgress)
          .values({ id: row.id, orgId: row.orgId, dossierId: row.dossierId, jobKind: row.jobKind, jobId: row.jobId, status: row.status, progress: row.progress, message: row.message, updatedAt: row.updatedAt })
          .onConflictDoUpdate({ target: jobProgress.id, set: { status: row.status, progress: row.progress, message: row.message, updatedAt: row.updatedAt } });
      },
      list: async (orgId, dossierId) => tx.select().from(jobProgress).where(and(eq(jobProgress.orgId, orgId), eq(jobProgress.dossierId, dossierId))).orderBy(desc(jobProgress.updatedAt)),
    },
  };
}

export class DrizzleDossierUow implements DossierUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: DossierRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
