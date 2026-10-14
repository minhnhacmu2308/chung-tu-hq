// Dữ liệu tờ khai cho module integration (truyền Hải quan): snapshot để dựng payload FPT, đánh dấu đã truyền, danh sách.
import type { DeclarationStatus } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { computeTaxes } from "../domain/tax.js";
import { allocateCustomsValue } from "../domain/valuation.js";
import { unconfirmedCount } from "./_dto.js";
import type { DeclarationDeps, DeclarationRow, LineItemRow } from "./ports.js";

export type DeclarationSnapshot = {
  declarationId: string; version: number; status: DeclarationStatus; kind: "IDA" | "EDA"; direction: "NK" | "XK"; currency: string;
  fields: Record<string, { value: string }>; items: Pick<LineItemRow, "lineNo" | "description" | "quantity" | "unit" | "unitPrice" | "amount" | "origin" | "hsConfirmed" | "importDutyRate" | "vatRate" | "policyNote">[];
  adjustments: { label: string; amount: string; currency: string }[]; containers: string[]; unconfirmedHs: number; estimatedTaxVnd: string;
};

export async function getDeclarationSnapshot(deps: DeclarationDeps, orgId: string, dossierId: string): Promise<DeclarationSnapshot | null> {
  const dossier = await deps.dossiers.get(orgId, dossierId);
  if (!dossier) return null;
  const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
  const { decl, items } = await deps.uow.asOrg(ctx, async (r) => ({ decl: await r.declarations.latest(orgId, dossierId), items: await r.lineItems.list(orgId, dossierId) }));
  if (!decl) return null;
  const shipment = await deps.shipments.latest(orgId, dossierId);
  const valuation = allocateCustomsValue({ items: items.map((i) => ({ id: i.id, amount: i.amount })), adjustments: decl.valueAdjustments, currency: dossier.currency, rates: { [dossier.currency]: decl.exchangeRate } });
  const taxes = computeTaxes(valuation.perItem.map((p) => ({ id: p.id, customsValueVnd: p.customsValueVnd, importDutyRate: items.find((i) => i.id === p.id)?.importDutyRate ?? null, vatRate: items.find((i) => i.id === p.id)?.vatRate ?? null })));
  return {
    declarationId: decl.id, version: decl.version, status: decl.status, kind: decl.kind, direction: dossier.direction, currency: dossier.currency,
    fields: Object.fromEntries(Object.entries(decl.fields).map(([k, f]) => [k, { value: f.value }])),
    items: items.map((i) => ({ lineNo: i.lineNo, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, amount: i.amount, origin: i.origin, hsConfirmed: i.hsConfirmed, importDutyRate: i.importDutyRate, vatRate: i.vatRate, policyNote: i.policyNote })),
    adjustments: decl.valueAdjustments.map((a) => ({ label: a.label, amount: a.amount, currency: a.currency })),
    containers: shipment?.transport.containers.map((c) => c.no) ?? [],
    unconfirmedHs: unconfirmedCount(items),
    estimatedTaxVnd: String(BigInt(taxes.importDutyVnd) + BigInt(taxes.vatVnd)),
  };
}

/** Tờ khai APPROVED → SUBMITTED (gọi từ integration.submitDeclaration sau khi tạo outbox). */
export async function markDeclarationSubmitted(deps: DeclarationDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string): Promise<Result<void>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const decl = await r.declarations.latest(ctx.orgId, dossierId);
    if (!decl) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
    if (decl.status === "SUBMITTED") return ok(undefined);
    if (decl.status !== "APPROVED") return err(domainError("NOT_APPROVED", "Tờ khai chưa được phê duyệt"));
    await r.declarations.update(decl.id, { status: "SUBMITTED", updatedAt: deps.clock.now() });
    return ok(undefined);
  });
}

/** Mở lại tờ khai (sau khi duyệt hoặc FPT từ chối khai trước): tờ khai → DRAFT, hồ sơ → NEEDS_REVIEW/review để sửa rồi duyệt lại. */
export async function markDeclarationDraft(deps: DeclarationDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string): Promise<Result<void>> {
  const r0 = await deps.uow.asOrg(ctx, async (r) => {
    const decl = await r.declarations.latest(ctx.orgId, dossierId);
    if (!decl) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
    if (decl.status === "DRAFT") return ok(undefined);
    await r.declarations.update(decl.id, { status: "DRAFT", approvedBy: null, approvedAt: null, updatedAt: deps.clock.now() });
    return ok(undefined);
  });
  if (!r0.ok) return r0;
  await deps.dossiers.update(ctx.orgId, dossierId, { status: "NEEDS_REVIEW", step: "review" });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "dossier.updated" });
  return ok(undefined);
}

export async function listDeclarationsForCustoms(deps: DeclarationDeps, orgId: string): Promise<{ dossierId: string; status: DeclarationStatus; approvedAt: Date | null }[]> {
  const rows: DeclarationRow[] = await deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.declarations.listLatestByStatus(orgId, ["APPROVED", "SUBMITTED"]));
  return rows.map((d) => ({ dossierId: d.dossierId, status: d.status, approvedAt: d.approvedAt }));
}
