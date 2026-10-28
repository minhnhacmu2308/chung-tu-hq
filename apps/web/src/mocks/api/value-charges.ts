// Chi phí và điều chỉnh trị giá người khai nhập ở bước OCR & kiểm tra (mock). Quy tắc theo Incoterm giống backend
// (packages/core declaration/domain/adjustments.ts); lưu xong tính lại trị giá tính thuế của tờ khai nháp.
import { ADJUSTMENT_CODES, canEditDeclaration, chargesConflict, EMPTY_VALUE_CHARGES, ValueChargesSchema, type DocumentCharges, type ValueCharges, type ValueChargesView } from "@kb/contracts";
import { ApiError, mutate, nowIso, query } from "@/lib/mock-request";
import { computeTaxes, EXCHANGE_RATES, shipmentOf } from "@/mocks/declaration-builder";
import { toMinor } from "@/lib/decimal";
import type { MockDb } from "@/mocks/db";
import type { Declaration, Dossier } from "@/mocks/types";
import { freightTermOfDossier, syncFreightTermCheck } from "@/mocks/freight-term";
import { reasonApiError } from "@/mocks/reason-error";
import { editScopeMockError } from "./customs";

export const valueChargesKeys = { detail: (dossierId: string) => ["value-charges", dossierId] as const };

const FREIGHT_NOT_INCLUDED = new Set(["EXW", "FCA", "FAS", "FOB"]);
const EXPORT_NO_DEDUCTION = new Set(["EXW", "FCA", "FAS", "FOB", "DAP", "DAF"]);
const INSURANCE_INCLUDED = new Set(["CIF", "CIP", "C&I", "DDU", "DDP", "DAP", "DAF", "DAT", "DPU"]);
const LOCKED = new Set(["APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"]);
const isFreight = (label: string) => label.startsWith("Cước");

const freightRequired = (d: Dossier) =>
  d.direction === "NK" ? FREIGHT_NOT_INCLUDED.has(d.incoterm) : d.incoterm !== "" && !EXPORT_NO_DEDUCTION.has(d.incoterm) && d.incoterm !== "C&I";

function documentCharges(d: Dossier): DocumentCharges {
  const adj = shipmentOf(d).adjustments;
  const freight = adj.find((a) => isFreight(a.label));
  return {
    freight: freight ? { amount: freight.amount.replace(/^-/, ""), currency: freight.currency, kind: "FREIGHT_INVOICE" } : null,
    insurance: null,
    other: adj.filter((a) => !isFreight(a.label)).map((a) => ({ label: a.label, amount: a.amount, currency: a.currency, kind: "INVOICE" as const })),
  };
}

/** Cước chứng từ quy đổi VND theo tỷ giá tính thuế mẫu (backend: Decimal, tỷ giá hôm nay), làm tròn đồng. */
function freightVndOf(c: DocumentCharges): string | null {
  const f = c.freight;
  const rate = f ? (f.currency === "VND" ? 1 : EXCHANGE_RATES[f.currency]) : undefined;
  return f && rate ? String(Math.round((toMinor(f.amount) * rate) / 100)) : null;
}

function view(db: MockDb, d: Dossier): ValueChargesView {
  const saved = db.valueCharges[d.id];
  const docs = documentCharges(d);
  return {
    charges: saved?.data ?? EMPTY_VALUE_CHARGES, fromDocuments: docs, freightVnd: freightVndOf(docs), direction: d.direction, incoterm: d.incoterm,
    freightRequired: freightRequired(d), freightTerm: freightTermOfDossier(db, d.id), insuranceIncluded: INSURANCE_INCLUDED.has(d.incoterm), locked: LOCKED.has(d.status),
    updatedAt: saved?.updatedAt ?? null, updatedBy: saved?.updatedBy ?? null,
  };
}

/** Khoản điều chỉnh của tờ khai theo chứng từ + nhập tay (nhập khẩu cộng, xuất khẩu trừ – số âm). */
function adjustmentsOf(d: Dossier, c: ValueCharges): Declaration["valueAdjustments"] {
  const nk = d.direction === "NK";
  const sign = (amount: string, add: boolean) => (add === nk ? amount : `-${amount}`);
  const doc = shipmentOf(d).adjustments.map((a) => ({ ...a, amount: a.amount.replace(/^-/, "") }));
  const out: Declaration["valueAdjustments"] = [];
  if (freightRequired(d)) {
    const docFreight = doc.find((a) => isFreight(a.label));
    if (c.freight?.amount && c.freight.currency) out.push({ label: "Cước vận chuyển quốc tế – người khai nhập", amount: sign(c.freight.amount, true), currency: c.freight.currency, source: "USER" });
    else if (docFreight) out.push({ ...docFreight, amount: sign(docFreight.amount, true) });
  }
  const insuranceApplies = nk ? !INSURANCE_INCLUDED.has(d.incoterm) : INSURANCE_INCLUDED.has(d.incoterm);
  if (insuranceApplies && c.insurance?.mode === "AMOUNT") out.push({ label: "Phí bảo hiểm – người khai nhập", amount: sign(c.insurance.amount, true), currency: c.insurance.currency, source: "USER" });
  if (!nk) return out;
  if (c.adjustments === null) return [...out, ...doc.filter((a) => !isFreight(a.label))];
  for (const a of c.adjustments) {
    const label = ADJUSTMENT_CODES.find((x) => x.code === a.code)?.label ?? `Khoản điều chỉnh ${a.code}`;
    out.push({ label: `${a.code} – ${label}`, amount: a.kind === "SB" ? `-${a.amount}` : a.amount, currency: a.currency, source: "USER" });
  }
  return out;
}

export const getValueCharges = (dossierId: string) =>
  query((db) => {
    const d = db.dossiers.find((x) => x.id === dossierId);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
    return view(db, d);
  });

export const saveValueCharges = (dossierId: string, input: ValueCharges) =>
  mutate((db) => {
    const d = db.dossiers.find((x) => x.id === dossierId);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
    const role = db.members.find((m) => m.id === db.currentUserId)?.role;
    if (!role || !canEditDeclaration(role)) throw new ApiError("FORBIDDEN", "Vai trò của bạn không được sửa chi phí", 403);
    if (LOCKED.has(d.status)) throw new ApiError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi sửa chi phí", 409);
    const scoped = editScopeMockError(db, d.id, { kind: "COMMON" });
    if (scoped) throw scoped;
    const parsed = ValueChargesSchema.parse(input);
    const data: ValueCharges = d.direction === "XK" ? { ...parsed, adjustments: null } : parsed;
    // Cùng ràng buộc theo chứng từ với backend (@kb/contracts chargesConflict).
    const conflict = chargesConflict(data, view(db, d));
    if (conflict) throw reasonApiError("VALIDATION", conflict.reason, conflict.params);
    db.valueCharges[d.id] = { data, updatedAt: nowIso(), updatedBy: db.currentUserId };
    syncFreightTermCheck(db, d.id);
    const decl = db.declarations.find((x) => x.dossierId === d.id);
    if (decl?.status === "DRAFT") {
      const adjustments = adjustmentsOf(d, data);
      const t = computeTaxes(d, db.lineItems.filter((i) => i.dossierId === d.id), adjustments);
      Object.assign(decl, { valueAdjustments: adjustments, customsValueVnd: t.customsValueVnd, estimatedImportDutyVnd: t.importDutyVnd, estimatedVatVnd: t.vatVnd });
    }
    return view(db, d);
  });
