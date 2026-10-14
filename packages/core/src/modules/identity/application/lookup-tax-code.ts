import type { CompanyLookup } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { normalizeTaxCode } from "../domain/tax-code.js";
import type { IdentityDeps } from "./ports.js";

/** Tra MST: đã có trên hệ thống → existing; chưa có → hỏi cơ quan thuế (port, xem BACKEND-TODO T3). */
export async function lookupTaxCode(deps: IdentityDeps, raw: string): Promise<Result<CompanyLookup>> {
  const taxCode = normalizeTaxCode(raw);
  if (!taxCode) return err(domainError("VALIDATION", "MST gồm 10 hoặc 13 chữ số"));
  const existing = await deps.uow.system((r) => r.orgs.findByTaxCode(taxCode));
  if (existing) return ok({ found: true, existing: true, name: existing.name, address: existing.address });
  const reg = await deps.taxRegistry.lookup(taxCode);
  if (!reg.found) return ok({ found: false });
  return ok({ found: true, existing: false, name: reg.name, address: reg.address });
}
