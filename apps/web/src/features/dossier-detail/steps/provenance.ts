// Câu giải thích nguồn gốc chỉ tiêu cho người duyệt (chỉ hiện khi khác quy tắc mặc định của hệ thống).
import type { FieldProvenance } from "@kb/contracts";

const SOURCE_LABELS: Record<string, string> = {
  "an.warehouse": "Kho / CY trên Arrival Notice",
  "transport.houseBillNo": "Vận đơn nhà (HB/L, HAWB)",
  "transport.masterBillNo": "Vận đơn chủ (MB/L, MAWB)",
  "transport.arrivalDate": "Ngày đến (ETA) trên Arrival Notice",
  "transport.departureDate": "Ngày đi (ngày B/L, ngày bay)",
};

export function provenanceLabel(p: FieldProvenance | undefined): string | null {
  if (!p || p.via === "default") return null;
  if (p.via === "profile") return "Theo Mặc định khai báo của doanh nghiệp";
  if (p.via === "fixed") return "Giá trị cố định doanh nghiệp đặt";
  const id = p.sourceId ?? "";
  return `Nguồn doanh nghiệp chọn: ${id.startsWith("profile.") ? "Mặc định khai báo" : (SOURCE_LABELS[id] ?? id)}`;
}
