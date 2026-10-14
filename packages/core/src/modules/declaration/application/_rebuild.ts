// Dựng (lại) tờ khai nháp từ dữ liệu hiện tại. Dùng bởi agent (BUILD_DECLARATION) và sau khi xác nhận HS / bỏ xác nhận.
import type { Shipment } from "@kb/contracts";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { planAdjustments } from "../domain/adjustments.js";
import { buildDeclaration, type BuiltDeclaration, type ExchangeInfo } from "../domain/build.js";
import { vnDate } from "../domain/mapping/types.js";
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

/** Các tiền tệ một lô hàng cần tỷ giá: tiền tệ hóa đơn + tiền tệ của từng khoản điều chỉnh. */
export function currenciesOf(shipment: Shipment, dossier: DossierInfo): string[] {
  const invoiceCurrency = shipment.invoice.currency.value ?? dossier.currency;
  return [invoiceCurrency, ...planAdjustments(shipment).adjustments.map((a) => a.currency)];
}

export function computeBuilt(deps: DeclarationDeps, shipment: Shipment, dossier: DossierInfo, org: OrgInfo, items: LineItemRow[], exchange: ExchangeInfo): BuiltDeclaration {
  return buildDeclaration({ shipment, dossier, org, items: items.map((i) => ({ id: i.id, amount: i.amount, importDutyRate: i.importDutyRate, vatRate: i.vatRate })), now: deps.clock.now(), exchange });
}

/** Giữ giá trị người dùng đã sửa (source USER) khi dựng lại. */
export function mergeUserEdits(fresh: Record<string, StoredField>, old: Record<string, StoredField> | undefined): Record<string, StoredField> {
  if (!old) return fresh;
  const out = { ...fresh };
  for (const [code, f] of Object.entries(old)) if (f.source === "USER") out[code] = { ...(fresh[code] ?? f), value: f.value, source: "USER", suspect: false };
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
    const exchange = await exchangeFor(r, currenciesOf(shipment, dossier), vnDate(now));
    const built = computeBuilt(deps, shipment, dossier, org, items, exchange);
    const patch = {
      fields: mergeUserEdits(built.fields, current.fields), updatedAt: now, exchangeRate: invoiceRate(exchange, shipment, dossier), exchangeRateDate: exchange.date,
      customsValueVnd: built.valuation.customsValueVnd, valueAdjustments: built.adjustments, estImportDutyVnd: built.taxes.importDutyVnd, estVatVnd: built.taxes.vatVnd,
    };
    await r.declarations.update(current.id, patch);
    return ok({ ...current, ...patch });
  });
}
