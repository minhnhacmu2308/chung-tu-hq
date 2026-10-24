import type { CrossCheck, Shipment } from "@kb/contracts";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { RuleContext } from "../domain/helpers.js";
import { runAllRules } from "../domain/run.js";
import type { ValidationDeps, ValidationRow } from "./ports.js";

export const toCrossCheck = (r: ValidationRow): CrossCheck => ({ id: r.id, dossierId: r.dossierId, ruleCode: r.ruleCode, title: r.title, detail: r.detail, result: r.result, severity: r.severity, documentKinds: r.documentKinds });

/** Chạy toàn bộ luật trên shipment, ghi đè kết quả cho hồ sơ (worker/extraction gọi). */
export async function runRules(deps: ValidationDeps, orgId: string, dossierId: string, shipment: Shipment, version: number, org: { taxCode: string; name: string }): Promise<CrossCheck[]> {
  const now = deps.clock.now();
  // Có hồ sơ → luật biết nhập/xuất và phương thức vận chuyển; không có port/hồ sơ → chạy như cũ (luật cần hồ sơ trả SKIPPED).
  const dossier = deps.dossiers ? await deps.dossiers.profile(orgId, dossierId) : null;
  const charges = deps.charges ? await deps.charges(orgId, dossierId) : null;
  const ctx: RuleContext = { org, ...(dossier ? { dossier } : {}), ...(charges ? { charges } : {}) };
  const rows: ValidationRow[] = runAllRules(shipment, ctx).map((o) => ({
    id: deps.idGen.next("chk"), orgId, dossierId, shipmentVersion: String(version), ruleCode: o.code, title: o.title, detail: o.detail, result: o.result, severity: o.severity, documentKinds: o.docKinds, fields: o.fields, createdAt: now,
  }));
  await deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.validations.replaceForDossier(orgId, dossierId, rows));
  return rows.map(toCrossCheck);
}
