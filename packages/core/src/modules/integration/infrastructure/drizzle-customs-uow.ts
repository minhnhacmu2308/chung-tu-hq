import { and, desc, eq } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { customsMessages, customsOutbox, customsResults } from "../../../db/schema/integration.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { CustomsRepos, CustomsUow, MessageRow, OutboxRow, ResultRow } from "../application/customs-ports.js";

function repos(tx: Tx): CustomsRepos {
  const toOutbox = (r: typeof customsOutbox.$inferSelect): OutboxRow => ({ ...r, operation: r.operation as OutboxRow["operation"], status: r.status as OutboxRow["status"] });
  const toMsg = (r: typeof customsMessages.$inferSelect): MessageRow => ({ ...r, operation: r.operation as MessageRow["operation"], direction: r.direction as MessageRow["direction"], result: r.result as MessageRow["result"] });
  const toResult = (r: typeof customsResults.$inferSelect): ResultRow => ({ ...r, channel: r.channel as ResultRow["channel"], clearanceStatus: r.clearanceStatus as ResultRow["clearanceStatus"], state: r.state as ResultRow["state"], raw: r.raw as ResultRow["raw"] });
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
      insert: async (row) => void (await tx.insert(customsOutbox).values(row)),
      update: async (id, patch) => void (await tx.update(customsOutbox).set(patch).where(eq(customsOutbox.id, id))),
    },
    messages: {
      list: async (orgId, dossierId) => (await tx.select().from(customsMessages).where(and(eq(customsMessages.orgId, orgId), eq(customsMessages.dossierId, dossierId))).orderBy(customsMessages.at, customsMessages.id)).map(toMsg),
      insert: async (row) => void (await tx.insert(customsMessages).values(row)),
    },
    results: {
      get: async (orgId, dossierId) => {
        const r = (await tx.select().from(customsResults).where(and(eq(customsResults.orgId, orgId), eq(customsResults.dossierId, dossierId))).limit(1))[0];
        return r ? toResult(r) : null;
      },
      listForOrg: async (orgId) => (await tx.select().from(customsResults).where(eq(customsResults.orgId, orgId)).orderBy(desc(customsResults.updatedAt))).map(toResult),
      upsert: async (row) => {
        await tx
          .insert(customsResults)
          .values(row)
          .onConflictDoUpdate({ target: customsResults.dossierId, set: { externalId: row.externalId, declarationNo: row.declarationNo, channel: row.channel, channelNote: row.channelNote, clearanceStatus: row.clearanceStatus, customsTaxVnd: row.customsTaxVnd, state: row.state, pollCount: row.pollCount, raw: row.raw, updatedAt: row.updatedAt } });
      },
    },
  };
}

export class DrizzleCustomsUow implements CustomsUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CustomsRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
