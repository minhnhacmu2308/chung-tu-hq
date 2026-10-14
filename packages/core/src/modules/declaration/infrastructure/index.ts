import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { asOrgId, asUserId, ulidIdGen } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { DossierDeps } from "../../dossier/index.js";
import type { ExtractionDeps } from "../../extraction/index.js";
import type { ValidationDeps } from "../../validation/index.js";
import type { AuditWriter, DeclarationDeps, DossierPort, HsClassifier, OrgReader, ShipmentReader, UserNames, ValidationReader } from "../application/ports.js";
import { DrizzleDeclarationUow } from "./drizzle-uow.js";
import { FakeHsClassifier, HscodeproClassifier } from "./hs-classifier.js";

export { DrizzleDeclarationUow, FakeHsClassifier, HscodeproClassifier };

const sys = (orgId: string) => ({ orgId: asOrgId(orgId), userId: asUserId("") });

/** Shipment + raw trích xuất từ module extraction (qua uow của nó). */
export function createShipmentReader(extraction: ExtractionDeps, dossier: DossierDeps): ShipmentReader {
  return {
    latest: async (orgId, dossierId) => (await extraction.uow.asOrg(sys(orgId), (r) => r.shipments.latest(dossierId)))?.data ?? null,
    extractions: async (orgId, dossierId) => {
      const docs = await dossier.uow.asOrg(sys(orgId), (r) => r.documents.list(orgId, dossierId));
      const rows = await extraction.uow.asOrg(sys(orgId), (r) => r.extractions.listDone(dossierId, docs.map((d) => d.id)));
      return rows.map((e) => ({ documentId: e.documentId, kind: e.kind, raw: e.raw }));
    },
  };
}

export function createDossierAdapter(dossier: DossierDeps): DossierPort {
  return {
    get: async (orgId, dossierId) => {
      const d = await dossier.uow.asOrg(sys(orgId), (r) => r.dossiers.get(orgId, dossierId));
      if (!d) return null;
      return {
        id: d.id, code: d.code, direction: d.direction, typeCode: d.typeCode, partner: d.partner, customsOfficeCode: d.customsOfficeCode, customsOfficeName: d.customsOfficeName, status: d.status, step: d.step,
        ownerId: d.ownerId, invoiceValue: d.invoiceValue, currency: d.currency, incoterm: d.incoterm, transportMode: d.transportMode, billNo: d.billNo, declarationNo: d.declarationNo, note: d.note,
      };
    },
    update: (orgId, dossierId, patch) => dossier.uow.asOrg(sys(orgId), (r) => r.dossiers.update(dossierId, { ...patch, updatedAt: dossier.clock.now() })),
    documents: async (orgId, dossierId) => (await dossier.uow.asOrg(sys(orgId), (r) => r.documents.list(orgId, dossierId))).map((d) => ({ id: d.id, kind: d.kind, fileName: d.fileName })),
    publish: (orgId, dossierId, event) => dossier.publisher.publish(orgId, dossierId, event),
    putFile: (key, body, mime) => dossier.storage.put(key, body, mime),
  };
}

export function createValidationReader(validation: ValidationDeps): ValidationReader {
  return { blockerFails: async (orgId, dossierId) => (await validation.uow.asOrg(sys(orgId), (r) => r.validations.listLatest(dossierId))).filter((v) => v.severity === "BLOCKER" && v.result === "FAIL").length };
}

/** field_audit thuộc extraction: ghi qua uow của extraction. */
export function createAuditWriter(extraction: ExtractionDeps): AuditWriter {
  return {
    append: (ctx, row) =>
      extraction.uow.asOrg(ctx, (r) => r.audit.insert({ id: ulidIdGen.next("fld"), orgId: ctx.orgId, dossierId: row.dossierId, fieldId: null, documentId: null, key: row.key, oldValue: row.oldValue, newValue: row.newValue, userId: ctx.userId, source: row.source, at: extraction.clock.now() })),
  };
}

export function createHsClassifier(env: Env, db: Db): HsClassifier {
  if (env.HS_CLASSIFIER === "hscodepro" && env.HSCODEPRO_URL) return new HscodeproClassifier(env.HSCODEPRO_URL);
  const uow = new DrizzleDeclarationUow(db);
  return new FakeHsClassifier(() => uow.asOrg(sys("org_system"), (r) => r.catalogHs.all()));
}

export function createDeclarationInfrastructure(opts: {
  db: Db; env: Env; queue: JobQueue; dossier: DossierDeps; extraction: ExtractionDeps; validation: ValidationDeps; org: OrgReader; users: UserNames; hs?: HsClassifier; clock?: Clock;
}): DeclarationDeps {
  return {
    uow: new DrizzleDeclarationUow(opts.db),
    queue: opts.queue,
    hs: opts.hs ?? createHsClassifier(opts.env, opts.db),
    shipments: createShipmentReader(opts.extraction, opts.dossier),
    dossiers: createDossierAdapter(opts.dossier),
    validation: createValidationReader(opts.validation),
    org: opts.org,
    audit: createAuditWriter(opts.extraction),
    users: opts.users,
    clock: opts.clock ?? systemClock,
    idGen: ulidIdGen,
  };
}
