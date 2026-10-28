// Nguồn thay thế dùng chung cho `options` của chỉ tiêu (doanh nghiệp chọn thứ tự nguồn ở Cài đặt → Khai báo).
import { resolveWarehouse } from "../catalog-resolve.js";
import { fromSourced, type MappedValue, type MappingInput, type SourceOption } from "./types.js";

const has = (v: MappedValue | null): MappedValue | null => (v && v.value !== null && v.value !== "" ? v : null);

/**
 * Kho/CY trên Arrival Notice → mã địa điểm lưu kho (A202) của chi cục khai báo: mã/tên khớp danh mục → mã đó; AN chỉ ghi tên bãi chung
 * → địa điểm tập kết do chi cục quản lý (nghi ngờ, người khai kiểm). Chưa nạp danh mục: "mã – tên" như trên AN, chỉ có tên → cần chọn mã.
 */
export function warehouseFromAn(i: MappingInput): MappedValue | null {
  const code = i.shipment.transport.warehouseCode;
  const name = i.shipment.transport.warehouseName;
  const hit = resolveWarehouse(code.value, name.value, i.catalogs?.warehouses);
  if (hit) {
    const base = fromSourced(code.value ? code : name, "ARRIVAL_NOTICE");
    const value = `${hit.entry.code} – ${hit.entry.name}`;
    return hit.exact ? { ...base, value } : { ...base, value, suspect: true, note: `Arrival Notice ghi kho “${name.value ?? code.value}” – không có trong danh mục địa điểm lưu kho của chi cục ${i.dossier.customsOfficeCode}: tạm khai địa điểm tập kết do chi cục quản lý, đổi mã nếu hàng lưu ở kho/bãi khác` };
  }
  if (code.value) return { ...fromSourced(code, "ARRIVAL_NOTICE"), value: name.value ? `${code.value} – ${name.value}` : code.value };
  if (name.value) return { ...fromSourced(name, "ARRIVAL_NOTICE"), suspect: true, note: `Arrival Notice chỉ ghi tên kho “${name.value}” – chọn mã địa điểm lưu kho VNACCS` };
  return null;
}

export const profileSource = (code: string, label = "Mặc định khai báo"): SourceOption => ({
  id: `profile.${code}`, label,
  read: (i) => {
    const v = i.profile[code]?.trim();
    return v ? { value: v, source: "DEFAULT", via: "profile" } : null;
  },
});

export const SRC = {
  anWarehouse: { id: "an.warehouse", label: "Kho / CY trên Arrival Notice", read: (i) => has(warehouseFromAn(i)) } satisfies SourceOption,
  // Giữ id "transport.houseBillNo" (quy tắc khai đã lưu của doanh nghiệp trỏ tới id này); đọc ô Số vận đơn – vận đơn nhà nếu có, không thì vận đơn duy nhất. Shipment cũ (gộp trước 28/10/2026, còn houseBillNo) dùng houseBillNo tới khi gộp lại.
  houseBill: { id: "transport.houseBillNo", label: "Vận đơn nhà (HB/L, HAWB)", read: (i) => has(fromSourced(i.shipment.transport.houseBillNo.value ? i.shipment.transport.houseBillNo : i.shipment.transport.billNo, "BILL_OF_LADING")) } satisfies SourceOption,
  masterBill: { id: "transport.masterBillNo", label: "Vận đơn chủ (MB/L, MAWB)", read: (i) => has(fromSourced(i.shipment.transport.masterBillNo, "BILL_OF_LADING")) } satisfies SourceOption,
  arrivalDate: { id: "transport.arrivalDate", label: "Ngày đến (ETA) trên Arrival Notice", read: (i) => has(fromSourced(i.shipment.transport.arrivalDate, "ARRIVAL_NOTICE")) } satisfies SourceOption,
  departureDate: { id: "transport.departureDate", label: "Ngày đi (ngày B/L, ngày bay)", read: (i) => has(fromSourced(i.shipment.transport.departureDate, "BILL_OF_LADING")) } satisfies SourceOption,
} as const;
