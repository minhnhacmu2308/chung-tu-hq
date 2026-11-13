// Hóa đơn thương mại do hệ thống phát hành sau thông quan (ADR 0013 mục 3). Thuần: bản chụp nội dung, ghép số vào Shipment.
import {
  convertItemQty, EMPTY_RELEASE_EXTRA, itemUnitKey, type InvoiceLayout, type IssueBlocker, type IssuedInvoiceSnapshot, type ItemUnitConversionTable, type PrintWarning, type ReleaseExtra, type Shipment,
} from "@kb/contracts";
import { dec, sumDec, toDecimalString } from "../../../shared/decimal.js";
import { lineAmount, put } from "./manual.js";

const v = (x: { value: string | null }) => x.value?.trim() || null;

/** Mặt hàng danh mục để in: mã nối, ĐVT gốc, bảng quy đổi và mã đã chọn theo bộ mã của mẫu (null = chưa có mã trong bộ). Khóa = id mặt hàng ghi trên dòng. */
export type PrintItemInfo = { itemNo: string; baseUnit: string | null; conversion: ItemUnitConversionTable | null; code: { code: string; unit: string | null } | null };
export type PrintCatalog = Record<string, PrintItemInfo>;

/** Phần ngoài Shipment in trên hóa đơn: người bán đầy đủ, ký mã hiệu, số tờ khai, thông tin bổ sung lúc phát hành, người ký, mẫu in. */
export type SnapshotExtra = {
  layout: InvoiceLayout;
  seller?: { address: string | null; phone: string | null };
  marks?: string | null;
  declarationNo?: string | null;
  extra?: ReleaseExtra | undefined;
  signatory?: { name: string | null; title: string | null } | null;
  /** Tra cứu danh mục (đã lấy ngoài transaction). Không có → in như cũ (Part No đọc từ chứng từ, lượng/ĐVT gốc). */
  print?: PrintCatalog;
};

type PrintedLine = { catalogItemId: string | null; printedCode: string | null; printedUnit: string; printedQuantity: string; printedUnitPrice: string | null };

/**
 * Mã/ĐVT/lượng in của một dòng. Không có mặt hàng danh mục → như cũ. Có mặt hàng: mã trong bộ, không có thì mã nối (không để trống).
 * ĐVT của mã khác ĐVT dòng → quy đổi qua đơn vị gốc, đơn giá chia cùng hệ số (thành tiền giữ nguyên); thiếu hệ số → giữ lượng/ĐVT gốc + cảnh báo.
 */
export function printLine(it: { partNo: string | null; quantity: string; unit: string; unitPrice: string; catalogItemId: string | null }, info: PrintItemInfo | undefined): { line: PrintedLine; warning: "UNIT_FACTOR_MISSING" | null } {
  const keep = (printedCode: string | null, warning: "UNIT_FACTOR_MISSING" | null = null) => ({
    line: { catalogItemId: it.catalogItemId, printedCode, printedUnit: it.unit, printedQuantity: it.quantity, printedUnitPrice: null },
    warning,
  });
  if (!info) return keep(it.partNo);
  if (!info.code) return keep(info.itemNo);
  const toUnit = info.code.unit?.trim();
  if (!toUnit || itemUnitKey(toUnit) === itemUnitKey(it.unit)) return keep(info.code.code);
  const conv = info.conversion ? convertItemQty(it.quantity, it.unit, toUnit, info.conversion) : null;
  if (!conv) return keep(info.code.code, "UNIT_FACTOR_MISSING");
  return {
    line: {
      catalogItemId: it.catalogItemId, printedCode: info.code.code, printedUnit: toUnit, printedQuantity: conv.qty,
      printedUnitPrice: dec(it.unitPrice).div(conv.factor).toDecimalPlaces(6).toFixed(),
    },
    warning: null,
  };
}

/**
 * Nội dung hóa đơn từ Shipment hiện tại (đã thông quan). `fallbackDate`: ngày invoice khi lô hàng chưa có ngày hóa đơn (ngày phát hành).
 * Tổng = Σ thành tiền dòng (làm tròn 2 số lẻ) – cùng cách tính với tổng trị giá hóa đơn trên tờ khai (manualTotal).
 */
export function buildSnapshot(
  s: Shipment, seller: { name: string; taxCode: string }, fallbackDate: string, extra: SnapshotExtra,
): { ok: true; snapshot: IssuedInvoiceSnapshot; warnings: PrintWarning[] } | { ok: false; blockers: IssueBlocker[] } {
  const blockers: IssueBlocker[] = [];
  if (!s.items.length) blockers.push("NO_ITEMS");
  const currency = v(s.invoice.currency);
  if (!currency) blockers.push("NO_CURRENCY");
  if (!v(s.parties.buyer.name)) blockers.push("NO_BUYER");
  const warnings: PrintWarning[] = [];
  const items = s.items.map((it, i) => {
    const quantity = v(it.quantity), unitPrice = v(it.unitPrice), unit = v(it.unit), description = v(it.description);
    const amount = v(it.amount) ?? (quantity && unitPrice ? lineAmount(quantity, unitPrice) : null);
    if (!(quantity && unitPrice && unit && description && amount)) return null;
    const catalogItemId = it.catalogItemId?.trim() || null;
    const partNo = v(it.partNo);
    const printed = printLine({ partNo, quantity, unit, unitPrice, catalogItemId }, catalogItemId ? extra.print?.[catalogItemId] : undefined);
    if (printed.warning) warnings.push({ lineNo: i + 1, code: printed.warning });
    return { lineNo: i + 1, description, partNo, hsCode: v(it.hsOnInvoice), quantity, unit, unitPrice, amount: toDecimalString(dec(amount), 2), origin: v(it.origin), ...printed.line };
  });
  if (items.some((x) => x === null)) blockers.push("ITEM_INCOMPLETE");
  if (blockers.length) return { ok: false, blockers };
  const lines = items.filter((x) => x !== null);
  const t = s.transport;
  return {
    ok: true,
    warnings,
    snapshot: {
      seller: extra.seller ? { ...seller, ...extra.seller } : seller,
      buyer: { name: v(s.parties.buyer.name), address: v(s.parties.buyer.address), country: v(s.parties.buyer.country), taxCode: v(s.parties.buyer.taxCode) },
      invoice: {
        date: v(s.invoice.date) ?? fallbackDate, incoterm: v(s.invoice.incoterm), incotermPlace: v(s.invoice.incotermPlace), currency: currency!,
        paymentTerms: v(s.invoice.paymentTerms), poNo: v(s.invoice.poNo), totalAmount: toDecimalString(sumDec(lines.map((l) => l.amount)), 2),
      },
      transport: {
        portOfLoading: v(t.portOfLoading), portOfDischarge: v(t.portOfDischarge), finalDestination: v(t.finalDestination), departureDate: v(t.departureDate),
        vessel: v(t.vessel), packages: v(t.packages), packageUnit: v(t.packageUnit), grossWeightKg: v(t.grossWeightKg), netWeightKg: v(t.netWeightKg),
        containers: t.containers.map((c) => ({ no: c.no, sealNo: c.sealNo, size: c.size })),
      },
      originCountry: v(s.origin.country),
      declarationNo: extra.declarationNo ?? null,
      marks: extra.marks ?? null,
      extra: extra.extra ?? EMPTY_RELEASE_EXTRA,
      signatory: extra.signatory ?? null,
      layout: extra.layout,
      items: lines,
    },
  };
}

/**
 * Ghép số hóa đơn đã cấp vào Shipment (sửa tại chỗ): số → `invoice.no` (chỉ tiêu Số hóa đơn trên tờ khai), ngày cấp số làm ngày hóa đơn nếu lô hàng chưa có.
 * `null` = chưa cấp số / đã hủy.
 */
export function applyIssued(s: Shipment, issued: { no: string; date: string } | null): Shipment {
  s.issuedInvoice = issued;
  if (!issued) return s;
  put(s.invoice.no, issued.no);
  if (!v(s.invoice.date)) put(s.invoice.date, issued.date);
  return s;
}
