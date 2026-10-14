import type { CrossCheck, Shipment } from "@kb/contracts";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { runAllRules } from "../domain/run.js";
import type { ValidationDeps, ValidationRow } from "./ports.js";

export const toCrossCheck = (r: ValidationRow): CrossCheck => ({ id: r.id, dossierId: r.dossierId, ruleCode: r.ruleCode, title: r.title, detail: r.detail, result: r.result, severity: r.severity, documentKinds: r.documentKinds });

/** Chạy toàn bộ luật trên shipment, ghi đè kết quả cho hồ sơ (worker/extraction gọi). */
export async function runRules(deps: ValidationDeps, orgId: string, dossierId: string, shipment: Shipment, version: number, org: { taxCode: string; name: string }): Promise<CrossCheck[]> {
  const now = deps.clock.now();
  const rows: ValidationRow[] = runAllRules(shipment, { org }).map((o) => ({
    id: deps.idGen.next("chk"), orgId, dossierId, shipmentVersion: String(version), ruleCode: o.code, title: o.title, detail: o.detail, result: o.result, severity: o.severity, documentKinds: o.docKinds, fields: o.fields, createdAt: now,
  }));
  await deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.validations.replaceForDossier(dossierId, rows));
  return rows.map(toCrossCheck);
}
