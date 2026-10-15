import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { withShipmentDefaults, type DocKind, type FieldGroup, type FieldStatus, type Region, type Shipment } from "@kb/contracts";
import type { Db, Tx } from "../../../db/client.js";
import { extractedFields, extractions, fieldAudit, shipments } from "../../../db/schema/extraction.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { ExtractionRepos, ExtractionRow, ExtractionUow, FieldRow, ShipmentRow } from "../application/ports.js";

function repos(tx: Tx): ExtractionRepos {
  const toExtraction = (r: typeof extractions.$inferSelect): ExtractionRow => ({ ...r, kind: r.kind as DocKind, regions: r.regions as Record<string, Region> | null, status: r.status as ExtractionRow["status"] });
  const toShipment = (r: typeof shipments.$inferSelect): ShipmentRow => ({ ...r, version: Number(r.version), data: withShipmentDefaults(r.data as Shipment) }); // shipment lưu trước v2 thiếu trường mới
  const toField = (r: typeof extractedFields.$inferSelect): FieldRow => ({ ...r, group: r.group as FieldGroup, status: r.status as FieldStatus, region: r.region as Region | null });
  return {
    lockDossier: async (dossierId) => void (await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${dossierId}))`)),
    extractions: {
      findByKey: async (k) => {
        const r = (await tx.select().from(extractions).where(eq(extractions.idempotencyKey, k)).limit(1))[0];
        return r ? toExtraction(r) : null;
      },
      listDone: async (_dossierId, ids) => (ids.length ? (await tx.select().from(extractions).where(and(inArray(extractions.documentId, ids), eq(extractions.status, "DONE")))).map(toExtraction) : []),
      insert: async (row) => void (await tx.insert(extractions).values({ ...row, raw: row.raw as object, regions: row.regions })),
      deleteForDocument: async (id) => void (await tx.delete(extractions).where(eq(extractions.documentId, id))),
    },
    shipments: {
      latest: async (dossierId) => {
        const r = (await tx.select().from(shipments).where(eq(shipments.dossierId, dossierId)).orderBy(desc(sql`cast(${shipments.version} as integer)`)).limit(1))[0];
        return r ? toShipment(r) : null;
      },
      insert: async (row) => void (await tx.insert(shipments).values({ ...row, version: String(row.version), data: row.data })),
      updateData: async (id, data) => void (await tx.update(shipments).set({ data }).where(eq(shipments.id, id))),
    },
    fields: {
      list: async (dossierId) => (await tx.select().from(extractedFields).where(eq(extractedFields.dossierId, dossierId)).orderBy(extractedFields.createdAt, extractedFields.id)).map(toField),
      get: async (id) => {
        const r = (await tx.select().from(extractedFields).where(eq(extractedFields.id, id)).limit(1))[0];
        return r ? toField(r) : null;
      },
      replaceForDossier: async (dossierId, rows) => {
        await tx.delete(extractedFields).where(eq(extractedFields.dossierId, dossierId));
        if (rows.length) await tx.insert(extractedFields).values(rows.map((r) => ({ ...r, region: r.region })));
      },
      update: async (id, patch) => void (await tx.update(extractedFields).set({ ...patch, updatedAt: new Date() }).where(eq(extractedFields.id, id))),
    },
    audit: { insert: async (row) => void (await tx.insert(fieldAudit).values(row)) },
  };
}

export class DrizzleExtractionUow implements ExtractionUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: ExtractionRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
