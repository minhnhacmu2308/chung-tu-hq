// Nối cổng customs với các module khác (qua public index của chúng) – chỉ composition root gọi.
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { getDeclarationSnapshot, listDeclarationsForCustoms, markDeclarationDraft, markDeclarationSubmitted, type DeclarationDeps } from "../../declaration/index.js";
import type { DossierDeps } from "../../dossier/index.js";
import { readVnaccsCredentials, type IdentityDeps } from "../../identity/index.js";
import type { ValidationDeps } from "../../validation/index.js";
import type { CertificateReader, CustomsDossierPort, DeclarationReader, ValidationReader } from "../application/customs-ports.js";
import type { VnaccsCredentialsReader } from "./fpt-vnaccs-gateway.js";

const sys = (orgId: string) => ({ orgId: asOrgId(orgId), userId: asUserId("") });

export function createDeclarationReader(declaration: DeclarationDeps): DeclarationReader {
  return {
    get: async (orgId, dossierId) => {
      const s = await getDeclarationSnapshot(declaration, orgId, dossierId);
      if (!s) return null;
      return {
        declarationId: s.declarationId, version: s.version, status: s.status, unconfirmedHs: s.unconfirmedHs, estimatedTaxVnd: s.estimatedTaxVnd, exchangeRateDate: s.exchangeRateDate, branchTaxVnd: s.branchTaxVnd, approvedAt: s.approvedAt,
        payload: { kind: s.kind, direction: s.direction, currency: s.currency, fields: s.fields, items: s.items, adjustments: s.adjustments, containers: s.containers },
      };
    },
    markSubmitted: async (ctx, dossierId) => {
      const r = await markDeclarationSubmitted(declaration, ctx, dossierId);
      if (!r.ok) throw new Error(`markSubmitted: ${r.error.code}`);
    },
    markDraft: async (ctx, dossierId) => {
      const r = await markDeclarationDraft(declaration, ctx, dossierId);
      if (!r.ok) throw new Error(`markDraft: ${r.error.code}`);
    },
    listForCustoms: (orgId) => listDeclarationsForCustoms(declaration, orgId),
  };
}

export function createCustomsDossierPort(dossier: DossierDeps): CustomsDossierPort {
  return {
    get: async (orgId, dossierId) => {
      const d = await dossier.uow.asOrg(sys(orgId), (r) => r.dossiers.get(orgId, dossierId));
      return d ? { id: d.id, code: d.code, direction: d.direction, typeCode: d.typeCode, partner: d.partner, status: d.status, step: d.step, declarationNo: d.declarationNo, updatedAt: d.updatedAt, ownerId: d.ownerId } : null;
    },
    update: (orgId, dossierId, patch) => dossier.uow.asOrg(sys(orgId), (r) => r.dossiers.update(orgId, dossierId, { ...patch, updatedAt: dossier.clock.now() })),
    documents: async (orgId, dossierId) => (await dossier.uow.asOrg(sys(orgId), (r) => r.documents.list(orgId, dossierId))).filter((d) => d.status === "DONE").map((d) => ({ id: d.id, kind: d.kind, fileName: d.fileName, storageKey: d.storageKey })),
    readFile: (key) => dossier.storage.get(key),
    publish: (orgId, dossierId, event) => dossier.publisher.publish(orgId, dossierId, event),
  };
}

export function createCustomsValidationReader(validation: ValidationDeps): ValidationReader {
  return { blockerFails: async (orgId, dossierId) => (await validation.uow.asOrg(sys(orgId), (r) => r.validations.listLatest(orgId, dossierId))).filter((v) => v.severity === "BLOCKER" && v.result === "FAIL").length };
}

export function createCertificateReader(identity: IdentityDeps): CertificateReader {
  return { exists: async (orgId, id) => (await identity.uow.asOrg(sys(orgId), (r) => r.certificates.list(orgId))).some((c) => c.id === id) };
}

/** Tài khoản VNACCS của doanh nghiệp (org_secrets); chưa nhập → `fallback` (tài khoản chung từ env, chỉ dev với fpt-mock). */
export function createVnaccsCredentialsReader(identity: IdentityDeps, fallback?: VnaccsCredentialsReader): VnaccsCredentialsReader {
  return {
    get: async (orgId) => {
      const a = await readVnaccsCredentials(identity, orgId);
      if (a) return { useR_ID: a.userId, password: a.password, terminaL_ID: a.terminalId, terminaL_ACCESS_KEY: a.terminalAccessKey };
      return (await fallback?.get(orgId)) ?? null;
    },
  };
}
