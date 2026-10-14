import type { CreateDossierInput, Dossier } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { nextDossierCode } from "../domain/code.js";
import { splitCustomsOffice, toDossier } from "./_dto.js";
import type { DossierDeps, DossierRow } from "./ports.js";

export async function createDossier(deps: DossierDeps, ctx: Ctx, input: CreateDossierInput): Promise<Result<Dossier>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  return deps.uow.asOrg(ctx, async (r) => {
    const ym = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthPrefix = `HS-${input.direction}-${ym}-`;
    const existing = await r.dossiers.codesInMonth(ctx.orgId, input.direction, monthPrefix);
    const allThisMonth = (await r.dossiers.list(ctx.orgId, {})).filter((d) => d.createdAt.getUTCFullYear() === now.getUTCFullYear() && d.createdAt.getUTCMonth() === now.getUTCMonth()).length;
    if (!(await deps.quota.check(ctx.orgId, "DOSSIER", allThisMonth + 1))) return err(domainError("QUOTA_EXCEEDED", "Đã hết số hồ sơ trong tháng của gói dịch vụ"));
    const office = splitCustomsOffice(input.customsOffice);
    const row: DossierRow = {
      id: deps.idGen.next("dos"), orgId: ctx.orgId, code: nextDossierCode(input.direction, now, existing), direction: input.direction, typeCode: input.typeCode,
      partner: input.partner, customsOfficeCode: office.code, customsOfficeName: office.name, skillSetId: input.skillSetId, status: "DRAFT", step: "upload",
      dueDate: input.dueDate, ownerId: ctx.userId, note: input.note ?? null, invoiceValue: "0", currency: "USD", incoterm: input.incoterm, transportMode: input.transportMode,
      billNo: "", suspectFields: 0, declarationNo: null, channel: null, createdAt: now, updatedAt: now,
    };
    await r.dossiers.insert(row);
    return ok(toDossier(row));
  });
}
