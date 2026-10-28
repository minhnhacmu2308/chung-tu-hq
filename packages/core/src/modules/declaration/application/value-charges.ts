// Chi phí và điều chỉnh trị giá người khai nhập ở bước OCR & kiểm tra (1.47 cước, 1.48 bảo hiểm, 1.49 khoản điều chỉnh; 2.40 xuất khẩu).
// Đọc: mọi thành viên. Ghi: người khai / người duyệt / quản trị, hồ sơ chưa duyệt – mỗi phần đổi ghi field_audit (bất biến 6), rồi dựng lại tờ khai nháp.
import { chargesConflict, EMPTY_VALUE_CHARGES, type DocumentCharges, type Shipment, type ValueCharges, type ValueChargesView } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { freightRequired, INSURANCE_INCLUDED, incotermCode } from "../domain/adjustments.js";
import { vnDate } from "../domain/mapping/types.js";
import { sheetScopeError } from "./_edit-scope.js";
import { Decimal, dec } from "../../../shared/decimal.js";
import { exchangeFor, rebuildDraft } from "./_rebuild.js";
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

/** Người trả cước trên vận đơn (Freight Prepaid / Collect); vận đơn không ghi → null. */
function freightTermOf(s: Shipment | null): "PREPAID" | "COLLECT" | null {
  const v = s?.transport.freightTerm?.value;
  return v === "PREPAID" || v === "COLLECT" ? v : null;
}

function toView(dossier: DossierInfo, shipment: Shipment | null, row: ValueChargesRow | null, freightVnd: string | null = null): ValueChargesView {
  const kind = dossier.direction === "NK" ? "IDA" : "EDA";
  const incoterm = incotermCode(shipment?.invoice.incoterm.value ?? dossier.incoterm);
  return {
    charges: row?.data ?? EMPTY_VALUE_CHARGES, fromDocuments: documentCharges(shipment), direction: dossier.direction, incoterm,
    freightRequired: freightRequired(kind, incoterm), freightTerm: freightTermOf(shipment), freightVnd, insuranceIncluded: INSURANCE_INCLUDED.has(incoterm), locked: LOCKED.has(dossier.status),
    updatedAt: row ? row.updatedAt.toISOString() : null, updatedBy: row?.updatedBy ?? null,
  };
}

/** Cước trên chứng từ quy đổi VND theo tỷ giá tính thuế hôm nay (VND = 1), làm tròn đồng; không có cước / chưa có tỷ giá → null. */
async function freightVndOf(deps: DeclarationDeps, ctx: Ctx, shipment: Shipment | null): Promise<string | null> {
  const freight = documentCharges(shipment).freight;
  if (!freight?.currency) return null;
  // Ngày khai theo giờ Việt Nam – cùng ngày tỷ giá với lúc dựng tờ khai (_rebuild), không dùng ngày UTC (bất biến 4).
  const date = vnDate(deps.clock.now());
  const fx = await deps.uow.asOrg(ctx, (r) => exchangeFor(r, [freight.currency], date));
  const rate = fx.rates[freight.currency];
  return rate ? dec(freight.amount).mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0) : null;
}

export async function getValueCharges(deps: DeclarationDeps, ctx: Ctx, dossierId: string): Promise<Result<ValueChargesView>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const shipment = await deps.shipments.latest(ctx.orgId, dossierId);
  const row = await deps.uow.asOrg(ctx, (r) => r.valueCharges.get(ctx.orgId, dossierId));
  return ok(toView(dossier, shipment, row, await freightVndOf(deps, ctx, shipment)));
}

/** Giá trị một phần để ghi audit (rỗng = theo chứng từ). */
const auditText = (v: unknown) => (v === null || v === undefined ? "" : JSON.stringify(v));
const PARTS = ["freight", "insurance", "adjustments", "freightTermNote"] as const;

export async function saveValueCharges(deps: DeclarationDeps, ctx: Ctx, dossierId: string, input: ValueCharges): Promise<Result<ValueChargesView>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (LOCKED.has(dossier.status)) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi sửa chi phí"));
  // Cước / bảo hiểm / khoản điều chỉnh là chỉ tiêu chung: lô nhiều tờ còn tờ chưa gọi về → khóa.
  const blocked = await sheetScopeError(deps, ctx, dossierId, { kind: "COMMON" });
  if (blocked) return err(blocked);
  // Xuất khẩu không có chỉ tiêu 1.49 – bỏ danh sách khoản điều chỉnh nếu gửi kèm.
  const data: ValueCharges = dossier.direction === "XK" ? { ...input, adjustments: null } : input;
  // Ràng buộc theo chứng từ: chứng từ có cước thì phải có số cước; có phí khác thì không khai "Không có phí phát sinh".
  const conflict = chargesConflict(data, toView(dossier, await deps.shipments.latest(ctx.orgId, dossierId), null));
  if (conflict) return err(reasonError("VALIDATION", conflict.reason, conflict.params));
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
  const latest = await deps.shipments.latest(ctx.orgId, dossierId);
  return ok(toView(dossier, latest, { ...row, ...(prev ? { id: prev.id } : {}) }, await freightVndOf(deps, ctx, latest)));
}
