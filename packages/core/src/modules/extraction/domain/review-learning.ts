// Chứng từ người dùng đã kiểm tra ở bước OCR → bản đọc "đúng" để làm mẫu cho skill: lấy dữ liệu model, ghi đè giá trị người dùng đã sửa.
// Dùng spec của shipment để biết trường trên màn OCR ứng với chỗ nào trong dữ liệu model (`rawPath`). Thuần.
import type { DocKind } from "@kb/contracts";
import { ITEM_SPECS, SHIPMENT_FIELDS } from "./shipment-spec.js";

export type ReviewedField = { key: string; label: string; value: string; originalValue: string; status: string; shipmentPath: string | null };
/** Một trường người dùng sửa: `rawPath` = chỗ trong dữ liệu model ("invoiceNo", "seller.name", "items.0.quantity"). */
export type Correction = { key: string; label: string; rawPath: string; from: string; to: string };

const ITEM_PATH = /^\/items\/(\d+)\/(\w+)$/;

/** Chỗ trong dữ liệu model của loại chứng từ ứng với một trường trên màn OCR; không ghi ngược được → null. */
export function rawPathOf(kind: DocKind, shipmentPath: string): string | null {
  const item = ITEM_PATH.exec(shipmentPath);
  if (item) {
    const spec = ITEM_SPECS.find((s) => s.field === item[2]);
    return spec ? `items.${item[1]}.${spec.raw ?? spec.field}` : null;
  }
  const spec = SHIPMENT_FIELDS.find((s) => s.path === shipmentPath);
  return spec?.sources.find((s) => s.kind === kind)?.get.rawPath ?? null;
}

function setAt(obj: Record<string, unknown>, path: string, to: string): boolean {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts.slice(0, -1)) {
    const next = Array.isArray(cur) ? cur[Number(p)] : (cur as Record<string, unknown> | null)?.[p];
    if (next === undefined || next === null) {
      // Model không đọc được cả bên (seller = null) → tạo object để ghi tên người dùng nhập; mảng dòng hàng thiếu dòng thì bỏ.
      if (Array.isArray(cur) || /^\d+$/.test(p)) return false;
      (cur as Record<string, unknown>)[p] = {};
    }
    cur = Array.isArray(cur) ? cur[Number(p)] : (cur as Record<string, unknown>)[p];
    if (typeof cur !== "object" || cur === null) return false;
  }
  const leaf = parts[parts.length - 1]!;
  const target = cur as Record<string, unknown>;
  // Giữ kiểu của model: số vẫn là số để so độ chính xác không lệch kiểu.
  target[leaf] = typeof target[leaf] === "number" && to.trim() !== "" && Number.isFinite(Number(to)) ? Number(to) : to;
  return true;
}

/** Dữ liệu model + giá trị người dùng đã sửa (USER_CONFIRMED khác giá trị AI đọc). Không đổi `data` gốc. */
export function applyCorrections(kind: DocKind, data: Record<string, unknown>, fields: readonly ReviewedField[]): { data: Record<string, unknown>; corrections: Correction[] } {
  const out = structuredClone(data);
  const corrections: Correction[] = [];
  for (const f of fields) {
    if (f.status !== "USER_CONFIRMED" || f.value === f.originalValue || !f.shipmentPath) continue;
    const rawPath = rawPathOf(kind, f.shipmentPath);
    if (rawPath && setAt(out, rawPath, f.value)) corrections.push({ key: f.key, label: f.label, rawPath, from: f.originalValue, to: f.value });
  }
  return { data: out, corrections };
}

const partyName = (d: Record<string, unknown>, p: string) => {
  const v = (d[p] as Record<string, unknown> | null | undefined)?.["name"];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** Tên nhà cung cấp (bên bán/gửi hàng) trên chứng từ – để chọn skill riêng của nhà cung cấp. */
export function supplierOf(kind: DocKind, data: Record<string, unknown>): string | null {
  const spec = SHIPMENT_FIELDS.find((s) => s.path === "/parties/seller/name");
  const v = spec?.sources.find((s) => s.kind === kind)?.get(data);
  if (typeof v === "string" && v.trim()) return v.trim();
  for (const p of ["seller", "shipper", "exporter"]) {
    const n = partyName(data, p);
    if (n) return n;
  }
  return null;
}
