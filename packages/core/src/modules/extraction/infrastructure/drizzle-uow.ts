import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { InvoiceLayoutSchema, IssuedInvoiceSnapshotSchema, ManualShipmentSchema, withShipmentDefaults, type IssuedStatus, type DocKind, type FieldGroup, type FieldStatus, type Region, type Shipment } from "@kb/contracts";
import type { Db, Tx } from "../../../db/client.js";
import { documentCounters, extractedFields, extractions, fieldAudit, invoiceTemplates, issuedDocuments, manualShipments, shipments } from "../../../db/schema/extraction.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { ExtractionRepos, ExtractionRow, ExtractionUow, FieldRow, IssuedRow, ShipmentRow, TemplateRow } from "../application/ports.js";

function repos(tx: Tx): ExtractionRepos {
  const toExtraction = (r: typeof extractions.$inferSelect): ExtractionRow => ({ ...r, kind: r.kind as DocKind, regions: r.regions as Record<string, Region> | null, status: r.status as ExtractionRow["status"] });
  const toShipment = (r: typeof shipments.$inferSelect): ShipmentRow => ({ ...r, version: Number(r.version), data: withShipmentDefaults(r.data as Shipment) }); // shipment lưu trước v2 thiếu trường mới
  const toField = (r: typeof extractedFields.$inferSelect): FieldRow => ({ ...r, group: r.group as FieldGroup, status: r.status as FieldStatus, region: r.region as Region | null });
  // jsonb đọc lại parse Zod (bất biến 9). Snapshot hỏng (vd bản GĐ2b cũ không có layout) → null, số vẫn giữ.
  const toIssued = (r: typeof issuedDocuments.$inferSelect): IssuedRow => {
    const snap = r.snapshot == null ? null : IssuedInvoiceSnapshotSchema.safeParse(r.snapshot);
    return { ...r, kind: "INVOICE", status: r.status as IssuedStatus, snapshot: snap?.success ? snap.data : null };
  };
  const toTemplate = (r: typeof invoiceTemplates.$inferSelect): TemplateRow[] => {
    const layout = InvoiceLayoutSchema.safeParse(r.layout);
    return layout.success ? [{ ...r, layout: layout.data }] : [];
  };
  const tplById = (orgId: string, id: string) => and(eq(invoiceTemplates.orgId, orgId), eq(invoiceTemplates.id, id));
  const counterKey = (orgId: string, kind: string, prefix: string, period: string) =>
    and(eq(documentCounters.orgId, orgId), eq(documentCounters.kind, kind), eq(documentCounters.prefix, prefix), eq(documentCounters.period, period));
  return {
    lockDossier: async (orgId, dossierId) => void (await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${orgId}:${dossierId}`}))`)),
    extractions: {
      findByKey: async (orgId, k) => {
        const r = (await tx.select().from(extractions).where(and(eq(extractions.orgId, orgId), eq(extractions.idempotencyKey, k))).limit(1))[0];
        return r ? toExtraction(r) : null;
      },
      listDone: async (orgId, _dossierId, ids) => (ids.length ? (await tx.select().from(extractions).where(and(eq(extractions.orgId, orgId), inArray(extractions.documentId, ids), eq(extractions.status, "DONE")))).map(toExtraction) : []),
      insert: async (row) => void (await tx.insert(extractions).values({ ...row, raw: row.raw as object, regions: row.regions })),
      deleteForDocument: async (orgId, id) => void (await tx.delete(extractions).where(and(eq(extractions.orgId, orgId), eq(extractions.documentId, id)))),
    },
    shipments: {
      latest: async (orgId, dossierId) => {
        const r = (await tx.select().from(shipments).where(and(eq(shipments.orgId, orgId), eq(shipments.dossierId, dossierId))).orderBy(desc(sql`cast(${shipments.version} as integer)`)).limit(1))[0];
        return r ? toShipment(r) : null;
      },
      insert: async (row) => void (await tx.insert(shipments).values({ ...row, version: String(row.version), data: row.data })),
      updateData: async (orgId, id, data) => void (await tx.update(shipments).set({ data }).where(and(eq(shipments.orgId, orgId), eq(shipments.id, id)))),
    },
    fields: {
      list: async (orgId, dossierId) => (await tx.select().from(extractedFields).where(and(eq(extractedFields.orgId, orgId), eq(extractedFields.dossierId, dossierId))).orderBy(extractedFields.createdAt, extractedFields.id)).map(toField),
      get: async (orgId, id) => {
        const r = (await tx.select().from(extractedFields).where(and(eq(extractedFields.orgId, orgId), eq(extractedFields.id, id))).limit(1))[0];
        return r ? toField(r) : null;
      },
      replaceForDossier: async (orgId, dossierId, rows) => {
        await tx.delete(extractedFields).where(and(eq(extractedFields.orgId, orgId), eq(extractedFields.dossierId, dossierId)));
        if (rows.length) await tx.insert(extractedFields).values(rows.map((r) => ({ ...r, region: r.region })));
      },
      update: async (orgId, id, patch) => void (await tx.update(extractedFields).set({ ...patch, updatedAt: new Date() }).where(and(eq(extractedFields.orgId, orgId), eq(extractedFields.id, id)))),
    },
    audit: { insert: async (row) => void (await tx.insert(fieldAudit).values(row)) },
    manual: {
      get: async (orgId, dossierId) => {
        const r = (await tx.select().from(manualShipments).where(and(eq(manualShipments.orgId, orgId), eq(manualShipments.dossierId, dossierId))).limit(1))[0];
        // jsonb đọc lại vẫn parse Zod (bất biến 9) – dữ liệu hỏng thì coi như chưa nhập.
        const data = r ? ManualShipmentSchema.safeParse(r.data) : null;
        return r && data?.success ? { ...r, data: data.data } : null;
      },
      upsert: async (row) =>
        void (await tx
          .insert(manualShipments)
          .values({ ...row, data: row.data })
          .onConflictDoUpdate({ target: [manualShipments.orgId, manualShipments.dossierId], set: { data: row.data, updatedBy: row.updatedBy, updatedAt: row.updatedAt } })),
    },
    issued: {
      list: async (orgId, dossierId) =>
        (await tx.select().from(issuedDocuments).where(and(eq(issuedDocuments.orgId, orgId), eq(issuedDocuments.dossierId, dossierId))).orderBy(desc(issuedDocuments.issuedAt))).map(toIssued),
      insert: async (row) => void (await tx.insert(issuedDocuments).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(issuedDocuments).set({ ...patch, updatedAt: new Date() }).where(and(eq(issuedDocuments.orgId, orgId), eq(issuedDocuments.id, id)))),
      exists: async (orgId, kind, no) =>
        (await tx.select({ id: issuedDocuments.id }).from(issuedDocuments).where(and(eq(issuedDocuments.orgId, orgId), eq(issuedDocuments.kind, kind), eq(issuedDocuments.no, no))).limit(1)).length > 0,
      // UPSERT … RETURNING: nguyên tử, khóa dòng đếm tới khi transaction cấp số commit → hai người cấp cùng lúc không trùng số.
      nextSeq: async (orgId, kind, prefix, period, now) =>
        (await tx
          .insert(documentCounters)
          .values({ orgId, kind, prefix, period, last: 1, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: [documentCounters.orgId, documentCounters.kind, documentCounters.prefix, documentCounters.period], set: { last: sql`${documentCounters.last} + 1`, updatedAt: now } })
          .returning({ last: documentCounters.last }))[0]!.last,
      peekSeq: async (orgId, kind, prefix, period) =>
        ((await tx.select({ last: documentCounters.last }).from(documentCounters).where(counterKey(orgId, kind, prefix, period)).limit(1))[0]?.last ?? 0) + 1,
    },
    templates: {
      list: async (orgId) => (await tx.select().from(invoiceTemplates).where(eq(invoiceTemplates.orgId, orgId)).orderBy(desc(invoiceTemplates.isDefault), invoiceTemplates.name)).flatMap(toTemplate),
      get: async (orgId, id) => (await tx.select().from(invoiceTemplates).where(tplById(orgId, id)).limit(1)).flatMap(toTemplate)[0] ?? null,
      insert: async (row) => void (await tx.insert(invoiceTemplates).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(invoiceTemplates).set(patch).where(tplById(orgId, id))),
      delete: async (orgId, id) => void (await tx.delete(invoiceTemplates).where(tplById(orgId, id))),
      clearDefault: async (orgId) => void (await tx.update(invoiceTemplates).set({ isDefault: false }).where(and(eq(invoiceTemplates.orgId, orgId), eq(invoiceTemplates.isDefault, true)))),
    },
  };
}

export class DrizzleExtractionUow implements ExtractionUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: ExtractionRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
