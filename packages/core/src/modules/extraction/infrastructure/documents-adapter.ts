// Nối extraction với dossier (chứng từ, hồ sơ, file, tiến trình) và identity (org) qua public index – composition root gọi.
import type { DocKind, DocumentStatus } from "@kb/contracts";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { DossierDeps } from "../../dossier/index.js";
import type { DocumentInfo, DocumentsPort } from "../application/ports.js";

export type OrgInfoReader = (orgId: string) => Promise<{ taxCode: string; name: string; suspectThreshold: "STRICT" | "BALANCED" | "RELAXED" }>;

export function createDocumentsAdapter(dossier: DossierDeps, orgInfo: OrgInfoReader): DocumentsPort {
  const ctx = (orgId: string) => ({ orgId: asOrgId(orgId), userId: asUserId("") });
  const toInfo = (d: { id: string; dossierId: string; kind: DocKind; kindSource: "AI" | "USER" | "FILENAME"; fileName: string; mime: string; pages: number; status: DocumentStatus; storageKey: string; sha256: string }): DocumentInfo => ({
    id: d.id, dossierId: d.dossierId, kind: d.kind, kindSource: d.kindSource, fileName: d.fileName, mime: d.mime, pages: d.pages, status: d.status, storageKey: d.storageKey, sha256: d.sha256,
  });
  return {
    get: async (orgId, id) => {
      const d = await dossier.uow.asOrg(ctx(orgId), (r) => r.documents.get(orgId, id));
      return d ? toInfo(d) : null;
    },
    listForDossier: async (orgId, dossierId) => (await dossier.uow.asOrg(ctx(orgId), (r) => r.documents.list(orgId, dossierId))).map(toInfo),
    setStatus: (orgId, id, status, patch) => dossier.uow.asOrg(ctx(orgId), (r) => r.documents.update(id, { status, ...(patch ?? {}) })),
    afterMerge: (orgId, dossierId, info) =>
      dossier.uow.asOrg(ctx(orgId), async (r) => {
        const d = await r.dossiers.get(orgId, dossierId);
        if (!d) return;
        const now = dossier.clock.now();
        const stillProcessing = d.status === "PROCESSING" || d.status === "DRAFT";
        await r.dossiers.update(dossierId, {
          suspectFields: info.suspectFields,
          ...(info.invoiceValue ? { invoiceValue: info.invoiceValue } : {}),
          ...(info.currency ? { currency: info.currency } : {}),
          ...(info.billNo ? { billNo: info.billNo } : {}),
          ...(info.allDone && stillProcessing ? { status: "NEEDS_REVIEW", step: "ocr" } : {}),
          updatedAt: now,
        });
      }),
    finishReading: (orgId, dossierId, suspectFields) => dossier.uow.asOrg(ctx(orgId), (r) => r.dossiers.update(dossierId, { suspectFields, step: "ocr", status: "NEEDS_REVIEW", updatedAt: dossier.clock.now() })),
    readFile: (key) => dossier.storage.get(key),
    dossierStatus: async (orgId, dossierId) => (await dossier.uow.asOrg(ctx(orgId), (r) => r.dossiers.get(orgId, dossierId)))?.status ?? null,
    publish: (orgId, dossierId, event) => dossier.publisher.publish(orgId, dossierId, event),
    orgInfo,
  };
}
