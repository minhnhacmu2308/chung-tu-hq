import type { CreateDossierInput, Dossier } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { nextDossierCode } from "../domain/code.js";
import { splitCustomsOffice, toDossier } from "./_dto.js";
import type { DossierDeps, DossierRow } from "./ports.js";

export async function createDossier(deps: DossierDeps, ctx: Ctx, input: CreateDossierInput): Promise<Result<Dossier>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const ym = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthPrefix = `HS-${input.direction}-${ym}-`;
  // Không còn hạn mức số hồ sơ/tháng (ADR 0011 – D7): khách trả tiền theo tờ khai được chấp nhận, không theo hồ sơ tạo ra.
  const existing = await deps.uow.asOrg(ctx, (r) => r.dossiers.codesInMonth(ctx.orgId, input.direction, monthPrefix));
  const office = splitCustomsOffice(input.customsOffice);
  const row: DossierRow = {
    id: deps.idGen.next("dos"), orgId: ctx.orgId, code: nextDossierCode(input.direction, now, existing), direction: input.direction, typeCode: input.typeCode,
    partner: input.partner, customsOfficeCode: office.code, customsOfficeName: office.name, skillSetId: input.skillSetId, status: "DRAFT", step: "upload",
    dueDate: input.dueDate, ownerId: ctx.userId, note: input.note ?? null, invoiceValue: "0", currency: "USD", incoterm: input.incoterm, transportMode: input.transportMode,
    partyClass: input.partyClass, billNo: "", suspectFields: 0, declarationNo: null, channel: null, createdAt: now, updatedAt: now,
  };
  await deps.uow.asOrg(ctx, (r) => r.dossiers.insert(row));
  return ok(toDossier(row));
}
