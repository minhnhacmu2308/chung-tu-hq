// Dữ liệu lô hàng nhập tay (ADR 0013 – Khai trước): ghép vào Shipment sau khi gộp chứng từ. Thuần.
// Nhập tay là dữ liệu người khai đã khai → thắng chứng từ; chứng từ đến sau (B/L, C/O) khác thì đánh dấu CONFLICT để người duyệt thấy (GĐ3 đối chiếu ngược).
import type { ManualShipment, Shipment, ShipmentItem, Sourced } from "@kb/contracts";
import { dec, sumDec, toDecimalString } from "../../../shared/decimal.js";

/** Đường dẫn trong Shipment ← giá trị nhập tay. Thứ tự cố định để nhật ký thay đổi ổn định. */
const SCALARS: [path: string, get: (m: ManualShipment) => string | null | undefined][] = [
  ["/parties/buyer/name", (m) => m.buyer.name],
  ["/parties/buyer/address", (m) => m.buyer.address],
  ["/parties/buyer/country", (m) => m.buyer.country],
  ["/parties/buyer/taxCode", (m) => m.buyer.taxCode],
  ["/invoice/date", (m) => m.invoice.date],
  ["/invoice/incoterm", (m) => m.invoice.incoterm],
  ["/invoice/incotermPlace", (m) => m.invoice.incotermPlace],
  ["/invoice/currency", (m) => m.invoice.currency],
  ["/invoice/paymentTerms", (m) => m.invoice.paymentTerms],
  ["/invoice/poNo", (m) => m.invoice.poNo],
  ["/transport/portOfLoading", (m) => m.transport.portOfLoading],
  ["/transport/portOfDischarge", (m) => m.transport.portOfDischarge],
  ["/transport/finalDestination", (m) => m.transport.finalDestination],
  ["/transport/departureDate", (m) => m.transport.departureDate],
  ["/transport/vessel", (m) => m.transport.vessel],
  ["/transport/packages", (m) => m.transport.packages],
  ["/transport/packageUnit", (m) => m.transport.packageUnit],
  ["/transport/grossWeightKg", (m) => m.transport.grossWeightKg],
  ["/transport/netWeightKg", (m) => m.transport.netWeightKg],
  ["/origin/country", (m) => m.origin.country],
  ["/marks", (m) => m.marks],
];

/** Thành tiền dòng = số lượng × đơn giá, làm tròn 2 số lẻ (Decimal – bất biến 3). Tổng invoice = Σ thành tiền đã làm tròn. */
export const lineAmount = (quantity: string, unitPrice: string) => toDecimalString(dec(quantity).times(dec(unitPrice)), 2);
export const manualTotal = (m: ManualShipment) => toDecimalString(sumDec(m.items.map((it) => lineAmount(it.quantity, it.unitPrice))), 2);

const UPPER = new Set(["/parties/buyer/country", "/origin/country", "/invoice/incoterm", "/invoice/currency"]);
const norm = (path: string, v: string) => (UPPER.has(path) ? v.toUpperCase() : v);

function leafOf(s: Shipment, path: string): Sourced<string> | undefined {
  let cur: unknown = s;
  const parts = path.split("/").filter(Boolean);
  for (const p of parts.slice(0, -1)) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return (cur as Record<string, Sourced<string>> | undefined)?.[parts[parts.length - 1]!];
}

/** Gán giá trị nhập tay: giữ nguồn chứng từ (để truy vết), lệch chứng từ → CONFLICT kèm ghi chú. */
export function put(leaf: Sourced<string>, value: string) {
  const other = leaf.sources.find((r) => (r.normalized ?? r.raw) !== value);
  leaf.value = value;
  if (other) {
    leaf.status = "CONFLICT";
    leaf.note = `Nhập tay "${value}" khác chứng từ ${other.kind}: "${other.normalized ?? other.raw}"`;
  } else {
    leaf.status = "USER_CONFIRMED";
    delete leaf.note;
  }
}

const manualSourced = (value: string | null): Sourced<string> => ({ value, sources: [], status: "USER_CONFIRMED" });

/** Ghép bản nhập tay vào Shipment đã gộp (sửa tại chỗ và trả lại). Ô để trống không xóa dữ liệu chứng từ. */
export function applyManual(s: Shipment, m: ManualShipment | null): Shipment {
  if (!m) return s;
  for (const [path, get] of SCALARS) {
    const v = get(m)?.trim();
    const leaf = leafOf(s, path);
    if (v && leaf) put(leaf, norm(path, v));
  }
  if (m.transport.containers.length) s.transport.containers = m.transport.containers.map((c) => ({ no: c.no.toUpperCase(), sealNo: c.sealNo ?? null, size: c.size ?? null }));
  if (m.items.length) {
    // Dòng hàng nhập tay thay dòng hàng đọc từ chứng từ (một nguồn duy nhất cho tờ khai và invoice phát hành).
    s.items = m.items.map((it, i): ShipmentItem => ({
      lineNo: i + 1,
      description: manualSourced(it.description),
      quantity: manualSourced(it.quantity),
      unit: manualSourced(it.unit.toUpperCase()),
      unitPrice: manualSourced(it.unitPrice),
      amount: manualSourced(lineAmount(it.quantity, it.unitPrice)),
      origin: manualSourced(it.origin?.toUpperCase() ?? null),
      hsOnInvoice: manualSourced(it.hsOnInvoice ?? null),
      partNo: manualSourced(it.partNo ?? null),
      catalogItemId: it.catalogItemId ?? null,
    }));
    put(s.invoice.totalAmount, manualTotal(m));
  }
  return s;
}

/** Nhật ký thay đổi (field_audit, bất biến 6): một dòng mỗi ô đổi; dòng hàng ghi theo `/items/<n>/<trường>`. */
export function manualChanges(prev: ManualShipment | null, next: ManualShipment): { key: string; oldValue: string; newValue: string }[] {
  const out: { key: string; oldValue: string; newValue: string }[] = [];
  const add = (key: string, a: string | null | undefined, b: string | null | undefined) => {
    if ((a ?? "") !== (b ?? "")) out.push({ key, oldValue: a ?? "", newValue: b ?? "" });
  };
  for (const [path, get] of SCALARS) add(path, prev ? get(prev) : null, get(next));
  const cont = (m: ManualShipment | null) => (m?.transport.containers ?? []).map((c) => [c.no, c.sealNo ?? "", c.size ?? ""].join("/")).join(", ");
  add("/transport/containers", cont(prev), cont(next));
  const n = Math.max(prev?.items.length ?? 0, next.items.length);
  const ITEM_KEYS = ["description", "quantity", "unit", "unitPrice", "origin", "hsOnInvoice", "partNo"] as const;
  for (let i = 0; i < n; i++) for (const k of ITEM_KEYS) add(`/items/${i + 1}/${k}`, prev?.items[i]?.[k], next.items[i]?.[k]);
  return out;
}
