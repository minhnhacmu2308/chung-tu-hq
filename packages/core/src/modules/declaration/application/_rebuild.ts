// Dựng (lại) tờ khai nháp từ dữ liệu hiện tại. Dùng bởi agent (BUILD_DECLARATION) và sau khi xác nhận HS / bỏ xác nhận.
import { EMPTY_VALUE_CHARGES, inapplicableExtraCodes, type Shipment, type ValueCharges } from "@kb/contracts";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { planAdjustmentsFor } from "../domain/adjustments.js";
import { buildDeclaration, type BuiltDeclaration, type ExchangeInfo } from "../domain/build.js";
import { vnDate, type FieldOverride } from "../domain/mapping/types.js";
import { profileFor } from "./declaration-profile.js";
import type { DeclarationDeps, DeclarationRepos, DeclarationRow, DossierInfo, LineItemRow, OrgInfo, StoredField } from "./ports.js";

export type RebuildCtx = { orgId: string; userId: string };

/** Tỷ giá theo ngày cho mọi tiền tệ cần dùng (hóa đơn + khoản điều chỉnh); VND = 1; thiếu → ghi vào `missing` (BACKEND-TODO D2). */
export async function exchangeFor(r: DeclarationRepos, currencies: string[], date: string): Promise<ExchangeInfo> {
  const rates: Record<string, string> = { VND: "1" };
  const missing: string[] = [];
  for (const c of new Set(currencies.filter(Boolean))) {
    if (c === "VND") continue;
    const fx = await r.exchangeRates.latest(c, date);
    if (fx) rates[c] = fx.rate;
    else missing.push(c);
  }
  return { date, rates, missing };
}

/** Các tiền tệ một lô hàng cần tỷ giá: tiền tệ hóa đơn + tiền tệ của từng khoản điều chỉnh (kể cả khoản người khai nhập). */
export function currenciesOf(shipment: Shipment, dossier: DossierInfo, charges: ValueCharges = EMPTY_VALUE_CHARGES): string[] {
  const invoiceCurrency = shipment.invoice.currency.value ?? dossier.currency;
  return [invoiceCurrency, ...planAdjustmentsFor(dossier.direction === "NK" ? "IDA" : "EDA", shipment, charges).adjustments.map((a) => a.currency)];
}

/** Chi phí người khai nhập ở bước OCR & kiểm tra; chưa nhập → chỉ theo chứng từ. */
export const chargesFor = async (r: DeclarationRepos, orgId: string, dossierId: string): Promise<ValueCharges> => (await r.valueCharges.get(orgId, dossierId))?.data ?? EMPTY_VALUE_CHARGES;

/** `cfg` = Mặc định khai báo + ghi đè của doanh nghiệp (profileFor); `charges` = chi phí người khai nhập (chargesFor). */
export function computeBuilt(deps: DeclarationDeps, shipment: Shipment, dossier: DossierInfo, org: OrgInfo, items: LineItemRow[], exchange: ExchangeInfo, cfg: { profile: Record<string, string>; overrides: Record<string, FieldOverride> } = { profile: {}, overrides: {} }, charges: ValueCharges = EMPTY_VALUE_CHARGES): BuiltDeclaration {
  const lines = items.map((i) => ({ id: i.id, lineNo: i.lineNo, amount: i.amount, importDutyRate: i.importDutyRate, vatRate: i.vatRate, hsConfirmed: i.hsConfirmed }));
  return buildDeclaration({ shipment, dossier, org, items: lines, now: deps.clock.now(), exchange, ...cfg, charges });
}

/**
 * Giữ giá trị người dùng đã sửa (source USER) khi dựng lại. `kind`: bỏ thêm ô bổ sung (mã = tên trường VNACCS) theo tình huống không còn áp dụng
 * với giá trị tờ khai sau khi gộp (vd 1.40 khi 1.39 không còn là D) – giống chỉ tiêu app có `when` (`hidden`).
 */
export function mergeUserEdits(fresh: Record<string, StoredField>, old: Record<string, StoredField> | undefined, hidden: readonly string[] = [], kind?: "IDA" | "EDA"): Record<string, StoredField> {
  if (!old) return fresh;
  const out = mergeKept(fresh, old, hidden);
  if (!kind) return out;
  for (const code of inapplicableExtraCodes(kind, Object.entries(out).map(([c, f]) => ({ code: c, value: f.value })))) delete out[code];
  return out;
}

function mergeKept(fresh: Record<string, StoredField>, old: Record<string, StoredField>, hidden: readonly string[]): Record<string, StoredField> {
  const out = { ...fresh };
  // Giống editDeclarationField: ô sửa tay không mang nguồn gốc/ghi chú của quy tắc (tránh hiện sai nguồn cho người duyệt).
  for (const [code, f] of Object.entries(old)) {
    if (f.source !== "USER") continue;
    // Chỉ tiêu theo tình huống không còn áp dụng (đổi loại hình, phương thức vận chuyển…) → bỏ giá trị đã sửa, không gửi Hải quan.
    if (hidden.includes(code)) continue;
    const base = fresh[code] ?? f;
    out[code] = { no: base.no, label: base.label, section: base.section, value: f.value, source: "USER", suspect: false, ...(base.condition ? { condition: base.condition } : {}) };
  }
  return out;
}

/** Tỷ giá tiền tệ hóa đơn (lưu trên tờ khai); thiếu → "0". */
export const invoiceRate = (exchange: ExchangeInfo, shipment: Shipment, dossier: DossierInfo) => exchange.rates[shipment.invoice.currency.value ?? dossier.currency] ?? "0";

/** Dựng lại tờ khai DRAFT mới nhất tại chỗ (giữ version, giữ sửa tay). Không có tờ khai hoặc đã duyệt → không làm gì. */
export async function rebuildDraft(deps: DeclarationDeps, ctx: RebuildCtx, dossierId: string): Promise<Result<DeclarationRow | null>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const shipment = await deps.shipments.latest(ctx.orgId, dossierId);
  if (!shipment) return ok(null);
  const org = await deps.org.get(ctx.orgId);
  const now = deps.clock.now();
  return deps.uow.asOrg({ orgId: asOrgId(ctx.orgId), userId: asUserId(ctx.userId) }, async (r) => {
    const current = await r.declarations.latest(ctx.orgId, dossierId);
    if (!current || current.status !== "DRAFT") return ok(current);
    const items = await r.lineItems.list(ctx.orgId, dossierId);
    const charges = await chargesFor(r, ctx.orgId, dossierId);
    const exchange = await exchangeFor(r, currenciesOf(shipment, dossier, charges), vnDate(now));
    const built = computeBuilt(deps, shipment, dossier, org, items, exchange, await profileFor(r, ctx.orgId, dossier.direction), charges);
    const patch = {
      fields: mergeUserEdits(built.fields, current.fields, built.hidden, built.kind), updatedAt: now, exchangeRate: invoiceRate(exchange, shipment, dossier), exchangeRateDate: exchange.date,
      customsValueVnd: built.valuation.customsValueVnd, valueAdjustments: built.adjustments, estImportDutyVnd: built.taxes.importDutyVnd, estVatVnd: built.taxes.vatVnd,
    };
    await r.declarations.update(current.orgId, current.id, patch);
    return ok({ ...current, ...patch });
  });
}
