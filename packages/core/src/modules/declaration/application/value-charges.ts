// Chi phí và điều chỉnh trị giá người khai nhập ở bước OCR & kiểm tra (1.47 cước, 1.48 bảo hiểm, 1.49 khoản điều chỉnh; 2.40 xuất khẩu).
// Đọc: mọi thành viên. Ghi: người khai / người duyệt / quản trị, hồ sơ chưa duyệt – mỗi phần đổi ghi field_audit (bất biến 6), rồi dựng lại tờ khai nháp.
import { EMPTY_VALUE_CHARGES, type DocumentCharges, type Shipment, type ValueCharges, type ValueChargesView } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { freightRequired, INSURANCE_INCLUDED, incotermCode } from "../domain/adjustments.js";
import { rebuildDraft } from "./_rebuild.js";
import type { DeclarationDeps, DossierInfo, ValueChargesRow } from "./ports.js";

/** Hồ sơ đã duyệt/truyền/hủy: chỉ xem (mở lại tờ khai trước khi sửa). */
const LOCKED = new Set(["APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"]);

function documentCharges(s: Shipment | null): DocumentCharges {
  if (!s) return { freight: null, insurance: null, other: [] };
  const cur = s.invoice.currency.value ?? "";
  const one = (amount: Shipment["charges"]["freight"], currency: Shipment["charges"]["freightCurrency"]) =>
    amount.value === null ? null : { amount: amount.value, currency: currency?.value ?? cur, kind: amount.sources[0]?.kind ?? null };
  return {
    freight: one(s.charges.freight, s.charges.freightCurrency),
    insurance: one(s.charges.insurance, s.charges.insuranceCurrency),
    other: s.charges.other.map((o) => ({ label: o.label, amount: o.amount, currency: o.currency, kind: o.sourceKind })),
  };
}

function toView(dossier: DossierInfo, shipment: Shipment | null, row: ValueChargesRow | null): ValueChargesView {
  const kind = dossier.direction === "NK" ? "IDA" : "EDA";
  const incoterm = incotermCode(shipment?.invoice.incoterm.value ?? dossier.incoterm);
  return {
    charges: row?.data ?? EMPTY_VALUE_CHARGES, fromDocuments: documentCharges(shipment), direction: dossier.direction, incoterm,
    freightRequired: freightRequired(kind, incoterm), insuranceIncluded: INSURANCE_INCLUDED.has(incoterm), locked: LOCKED.has(dossier.status),
    updatedAt: row ? row.updatedAt.toISOString() : null, updatedBy: row?.updatedBy ?? null,
  };
}

export async function getValueCharges(deps: DeclarationDeps, ctx: Ctx, dossierId: string): Promise<Result<ValueChargesView>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const shipment = await deps.shipments.latest(ctx.orgId, dossierId);
  const row = await deps.uow.asOrg(ctx, (r) => r.valueCharges.get(ctx.orgId, dossierId));
  return ok(toView(dossier, shipment, row));
}

/** Giá trị một phần để ghi audit (rỗng = theo chứng từ). */
const auditText = (v: unknown) => (v === null ? "" : JSON.stringify(v));
const PARTS = ["freight", "insurance", "adjustments"] as const;

export async function saveValueCharges(deps: DeclarationDeps, ctx: Ctx, dossierId: string, input: ValueCharges): Promise<Result<ValueChargesView>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (LOCKED.has(dossier.status)) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi sửa chi phí"));
  // Xuất khẩu không có chỉ tiêu 1.49 – bỏ danh sách khoản điều chỉnh nếu gửi kèm.
  const data: ValueCharges = dossier.direction === "XK" ? { ...input, adjustments: null } : input;
  const now = deps.clock.now();
  const row: ValueChargesRow = { id: deps.idGen.next("dec"), orgId: ctx.orgId, dossierId, data, updatedBy: ctx.userId, updatedAt: now };
  const prev = await deps.uow.asOrg(ctx, async (r) => {
    const before = await r.valueCharges.get(ctx.orgId, dossierId);
    await r.valueCharges.upsert(before ? { ...row, id: before.id } : row);
    return before;
  });
  const old = prev?.data ?? EMPTY_VALUE_CHARGES;
  for (const part of PARTS) {
    const [o, n] = [auditText(old[part]), auditText(data[part])];
    if (o !== n) await deps.audit.append(ctx, { dossierId, key: `CHARGES.${part}`, oldValue: o, newValue: n, source: "CHARGE_EDIT" });
  }
  await deps.onChargesSaved?.(ctx.orgId, dossierId);
  const rebuilt = await rebuildDraft(deps, ctx, dossierId);
  if (!rebuilt.ok) return rebuilt;
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "dossier.updated" });
  return ok(toView(dossier, await deps.shipments.latest(ctx.orgId, dossierId), { ...row, ...(prev ? { id: prev.id } : {}) }));
}
