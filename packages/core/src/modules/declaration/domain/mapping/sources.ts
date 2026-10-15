// Nguồn thay thế dùng chung cho `options` của chỉ tiêu (doanh nghiệp chọn thứ tự nguồn ở Cài đặt → Khai báo).
import { fromSourced, type MappedValue, type MappingInput, type SourceOption } from "./types.js";

const has = (v: MappedValue | null): MappedValue | null => (v && v.value !== null && v.value !== "" ? v : null);

/** Kho/CY trên Arrival Notice: "mã – tên"; chỉ có tên → cần chọn mã (nghi ngờ). */
export function warehouseFromAn(i: MappingInput): MappedValue | null {
  const code = i.shipment.transport.warehouseCode;
  const name = i.shipment.transport.warehouseName;
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
  houseBill: { id: "transport.houseBillNo", label: "Vận đơn nhà (HB/L, HAWB)", read: (i) => has(fromSourced(i.shipment.transport.houseBillNo, "BILL_OF_LADING")) } satisfies SourceOption,
  masterBill: { id: "transport.masterBillNo", label: "Vận đơn chủ (MB/L, MAWB)", read: (i) => has(fromSourced(i.shipment.transport.masterBillNo, "BILL_OF_LADING")) } satisfies SourceOption,
  arrivalDate: { id: "transport.arrivalDate", label: "Ngày đến (ETA) trên Arrival Notice", read: (i) => has(fromSourced(i.shipment.transport.arrivalDate, "ARRIVAL_NOTICE")) } satisfies SourceOption,
  departureDate: { id: "transport.departureDate", label: "Ngày đi (ngày B/L, ngày bay)", read: (i) => has(fromSourced(i.shipment.transport.departureDate, "BILL_OF_LADING")) } satisfies SourceOption,
} as const;
