import { and, count, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { customsMessages, customsOutbox, customsResults, postAmendments } from "../../../db/schema/integration.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { CustomsRepos, CustomsUow, MessageRow, OutboxRow, PostAmendmentRow, ResultRow } from "../application/customs-ports.js";

function repos(tx: Tx): CustomsRepos {
  const toOutbox = (r: typeof customsOutbox.$inferSelect): OutboxRow => ({ ...r, operation: r.operation as OutboxRow["operation"], status: r.status as OutboxRow["status"] });
  const toMsg = (r: typeof customsMessages.$inferSelect): MessageRow => ({ ...r, operation: r.operation as MessageRow["operation"], direction: r.direction as MessageRow["direction"], result: r.result as MessageRow["result"] });
  const toResult = (r: typeof customsResults.$inferSelect): ResultRow => ({ ...r, channel: r.channel as ResultRow["channel"], clearanceStatus: r.clearanceStatus as ResultRow["clearanceStatus"], state: r.state as ResultRow["state"], raw: r.raw as ResultRow["raw"] });
  const toAmendment = (r: typeof postAmendments.$inferSelect): PostAmendmentRow => {
    const { approvedBy, result, ...rest } = r;
    return {
      ...rest, status: r.status as PostAmendmentRow["status"], header: r.header as PostAmendmentRow["header"], lines: r.lines as PostAmendmentRow["lines"],
      ...(approvedBy ? { approvedBy } : {}), ...(result ? { result: result as NonNullable<PostAmendmentRow["result"]> } : {}),
    };
  };
  const amendmentCols = (row: PostAmendmentRow) => ({ status: row.status, header: row.header, lines: row.lines, approvedBy: row.approvedBy ?? null, approvedAt: row.approvedAt, result: row.result ?? null, updatedAt: row.updatedAt });
  return {
    outbox: {
      get: async (orgId, id) => {
        const r = (await tx.select().from(customsOutbox).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.id, id))).limit(1))[0];
        return r ? toOutbox(r) : null;
      },
      findByKey: async (orgId, key) => {
        const r = (await tx.select().from(customsOutbox).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.idempotencyKey, key))).limit(1))[0];
        return r ? toOutbox(r) : null;
      },
      listForDossier: async (orgId, dossierId) => (await tx.select().from(customsOutbox).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.dossierId, dossierId))).orderBy(customsOutbox.createdAt, customsOutbox.id)).map(toOutbox),
      listUnsentBefore: async (orgId, before) => (await tx.select().from(customsOutbox).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.status, "PENDING"), eq(customsOutbox.attempts, 0), lt(customsOutbox.createdAt, before))).orderBy(customsOutbox.createdAt).limit(200)).map(toOutbox),
      insert: async (row) => void (await tx.insert(customsOutbox).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(customsOutbox).set(patch).where(and(eq(customsOutbox.orgId, orgId), eq(customsOutbox.id, id)))),
    },
    messages: {
      list: async (orgId, dossierId, branch) => (await tx.select().from(customsMessages).where(and(eq(customsMessages.orgId, orgId), eq(customsMessages.dossierId, dossierId), branch === undefined ? undefined : eq(customsMessages.branch, branch))).orderBy(customsMessages.at, customsMessages.id)).map(toMsg),
      insert: async (row) => void (await tx.insert(customsMessages).values(row)),
    },
    results: {
      get: async (orgId, dossierId, branch = 1) => {
        const r = (await tx.select().from(customsResults).where(and(eq(customsResults.orgId, orgId), eq(customsResults.dossierId, dossierId), eq(customsResults.branch, branch))).limit(1))[0];
        return r ? toResult(r) : null;
      },
      listForDossier: async (orgId, dossierId) => (await tx.select().from(customsResults).where(and(eq(customsResults.orgId, orgId), eq(customsResults.dossierId, dossierId))).orderBy(customsResults.branch)).map(toResult),
      listForDossiers: async (orgId, dossierIds) =>
        dossierIds.length ? (await tx.select().from(customsResults).where(and(eq(customsResults.orgId, orgId), inArray(customsResults.dossierId, dossierIds))).orderBy(customsResults.dossierId, customsResults.branch)).map(toResult) : [],
      issuedCount: async (orgId, dossierId) => (await tx.select({ n: count() }).from(customsResults).where(and(eq(customsResults.orgId, orgId), eq(customsResults.dossierId, dossierId), isNotNull(customsResults.declarationNo))))[0]?.n ?? 0,
      listForOrg: async (orgId) => (await tx.select().from(customsResults).where(eq(customsResults.orgId, orgId)).orderBy(desc(customsResults.updatedAt))).map(toResult),
      deleteUnsentAbove: async (orgId, dossierId, branch) =>
        (await tx.delete(customsResults).where(and(eq(customsResults.orgId, orgId), eq(customsResults.dossierId, dossierId), gt(customsResults.branch, branch), isNull(customsResults.declarationNo), sql`${customsResults.raw}->>'stage' = 'NOT_SENT'`)).returning({ id: customsResults.id })).length,
      upsert: async (row) => {
        await tx
          .insert(customsResults)
          .values(row)
          .onConflictDoUpdate({ target: [customsResults.dossierId, customsResults.branch], set: { externalId: row.externalId, declarationNo: row.declarationNo, channel: row.channel, channelNote: row.channelNote, clearanceStatus: row.clearanceStatus, customsTaxVnd: row.customsTaxVnd, state: row.state, pollCount: row.pollCount, raw: row.raw, updatedAt: row.updatedAt } });
      },
    },
    amendments: {
      listForDossier: async (orgId, dossierId, branch) => (await tx.select().from(postAmendments).where(and(eq(postAmendments.orgId, orgId), eq(postAmendments.dossierId, dossierId), branch === undefined ? undefined : eq(postAmendments.branch, branch))).orderBy(postAmendments.branch, postAmendments.seq)).map(toAmendment),
      insert: async (row) => void (await tx.insert(postAmendments).values({ id: row.id, orgId: row.orgId, dossierId: row.dossierId, branch: row.branch, seq: row.seq, createdAt: row.createdAt, ...amendmentCols(row) })),
      update: async (row) => void (await tx.update(postAmendments).set(amendmentCols(row)).where(and(eq(postAmendments.orgId, row.orgId), eq(postAmendments.id, row.id)))),
    },
  };
}

export class DrizzleCustomsUow implements CustomsUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CustomsRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
