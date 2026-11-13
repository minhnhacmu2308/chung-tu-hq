import type { Db } from "../../../db/client.js";
import type { OrgAuditWriter } from "../../../shared/audit.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import { listApprovedLinesForCatalog, type DeclarationDeps } from "../../declaration/index.js";
import { listInvoiceLinesForCatalog, type ExtractionDeps } from "../../extraction/index.js";
import type { CatalogAuditWriter, CatalogDeps, CatalogDocumentSource, CatalogMembers } from "../application/ports.js";
import { DrizzleCatalogUow } from "./drizzle-catalog-uow.js";

export { DrizzleCatalogUow };

/** field_audit thuộc extraction: ghi qua uow của extraction (kết nối riêng, sau khi transaction của catalog commit). */
export function createCatalogAuditWriter(extraction: ExtractionDeps): CatalogAuditWriter {
  return {
    append: (ctx, row) =>
      extraction.uow.asOrg(ctx, (r) =>
        r.audit.insert({ id: ulidIdGen.next("fld"), orgId: ctx.orgId, dossierId: row.dossierId, fieldId: null, documentId: null, key: row.key, oldValue: row.oldValue, newValue: row.newValue, userId: ctx.userId, source: row.source, at: extraction.clock.now() }),
      ),
    list: async (ctx, itemId, limit) =>
      (await extraction.uow.asOrg(ctx, (r) => r.audit.listForObject(ctx.orgId, itemId, "CATALOG_EDIT", limit))).map((a) => ({ key: a.key, oldValue: a.oldValue, newValue: a.newValue, userId: a.userId, at: a.at })),
  };
}

/** Dòng hàng từ chứng từ đã có – đọc qua public API của declaration (tờ khai đã duyệt) và extraction (lô hàng đã đọc). */
export function createCatalogDocumentSource(opts: { declaration: Pick<DeclarationDeps, "uow">; extraction: Pick<ExtractionDeps, "uow" | "documents"> }): CatalogDocumentSource {
  return {
    approvedDeclarationLines: async (orgId) =>
      (await listApprovedLinesForCatalog(opts.declaration, orgId)).map((l) => ({ code: l.itemCode, name: l.description, unit: l.unit || null, hsCode: l.hsCode, sourceRef: `declaration:${l.declarationId}:${l.lineNo}` })),
    invoiceLines: async (orgId) =>
      (await listInvoiceLinesForCatalog(opts.extraction, orgId)).map((l) => ({ code: l.partNo, name: l.description ?? l.partNo, unit: l.unit, hsCode: l.hsCode, partnerName: l.partnerName, partnerKind: l.partnerKind, sourceRef: `dossier:${l.dossierId}:${l.lineNo}` })),
  };
}

export function createCatalogInfrastructure(opts: { db: Db; extraction: ExtractionDeps; declaration: Pick<DeclarationDeps, "uow">; jobs: JobQueue; members: CatalogMembers; orgAudit?: OrgAuditWriter; clock?: Clock }): CatalogDeps {
  return {
    uow: new DrizzleCatalogUow(opts.db),
    audit: createCatalogAuditWriter(opts.extraction),
    jobs: opts.jobs,
    documents: createCatalogDocumentSource(opts),
    members: opts.members,
    ...(opts.orgAudit ? { orgAudit: opts.orgAudit } : {}),
    clock: opts.clock ?? systemClock,
    idGen: ulidIdGen,
  };
}
