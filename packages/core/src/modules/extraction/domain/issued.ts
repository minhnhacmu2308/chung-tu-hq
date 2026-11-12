// Hóa đơn thương mại do hệ thống phát hành sau thông quan (ADR 0013 mục 3). Thuần: bản chụp nội dung, ghép số vào Shipment.
import { EMPTY_RELEASE_EXTRA, type InvoiceLayout, type IssueBlocker, type IssuedInvoiceSnapshot, type ReleaseExtra, type Shipment } from "@kb/contracts";
import { dec, sumDec, toDecimalString } from "../../../shared/decimal.js";
import { lineAmount, put } from "./manual.js";

const v = (x: { value: string | null }) => x.value?.trim() || null;

/** Phần ngoài Shipment in trên hóa đơn: người bán đầy đủ, ký mã hiệu, số tờ khai, thông tin bổ sung lúc phát hành, người ký, mẫu in. */
export type SnapshotExtra = {
  layout: InvoiceLayout;
  seller?: { address: string | null; phone: string | null };
  marks?: string | null;
  declarationNo?: string | null;
  extra?: ReleaseExtra | undefined;
  signatory?: { name: string | null; title: string | null } | null;
};

/**
 * Nội dung hóa đơn từ Shipment hiện tại (đã thông quan). `fallbackDate`: ngày invoice khi lô hàng chưa có ngày hóa đơn (ngày phát hành).
 * Tổng = Σ thành tiền dòng (làm tròn 2 số lẻ) – cùng cách tính với tổng trị giá hóa đơn trên tờ khai (manualTotal).
 */
export function buildSnapshot(
  s: Shipment, seller: { name: string; taxCode: string }, fallbackDate: string, extra: SnapshotExtra,
): { ok: true; snapshot: IssuedInvoiceSnapshot } | { ok: false; blockers: IssueBlocker[] } {
  const blockers: IssueBlocker[] = [];
  if (!s.items.length) blockers.push("NO_ITEMS");
  const currency = v(s.invoice.currency);
  if (!currency) blockers.push("NO_CURRENCY");
  if (!v(s.parties.buyer.name)) blockers.push("NO_BUYER");
  const items = s.items.map((it, i) => {
    const quantity = v(it.quantity), unitPrice = v(it.unitPrice), unit = v(it.unit), description = v(it.description);
    const amount = v(it.amount) ?? (quantity && unitPrice ? lineAmount(quantity, unitPrice) : null);
    return quantity && unitPrice && unit && description && amount
      ? { lineNo: i + 1, description, partNo: v(it.partNo), hsCode: v(it.hsOnInvoice), quantity, unit, unitPrice, amount: toDecimalString(dec(amount), 2), origin: v(it.origin) }
      : null;
  });
  if (items.some((x) => x === null)) blockers.push("ITEM_INCOMPLETE");
  if (blockers.length) return { ok: false, blockers };
  const lines = items.filter((x) => x !== null);
  const t = s.transport;
  return {
    ok: true,
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
