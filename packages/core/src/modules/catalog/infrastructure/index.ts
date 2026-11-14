import type { Db } from "../../../db/client.js";
import type { OrgAuditWriter } from "../../../shared/audit.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import { listApprovedLinesForCatalog, type DeclarationDeps } from "../../declaration/index.js";
import { listInvoiceLinesForCatalog, type ExtractionDeps } from "../../extraction/index.js";
import type { CatalogDeps, CatalogDocumentSource, CatalogMembers } from "../application/ports.js";
import { DrizzleCatalogUow } from "./drizzle-catalog-uow.js";

export { DrizzleCatalogUow };

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
    jobs: opts.jobs,
    documents: createCatalogDocumentSource(opts),
    members: opts.members,
    ...(opts.orgAudit ? { orgAudit: opts.orgAudit } : {}),
    clock: opts.clock ?? systemClock,
    idGen: ulidIdGen,
  };
}
