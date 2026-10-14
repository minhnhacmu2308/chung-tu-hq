import type { IntegrationId } from "@kb/contracts";

/** Danh sách cố định hiển thị trên màn Kết nối hệ thống (thứ tự như mock). */
export const INTEGRATIONS: { id: IntegrationId; name: string; description: string }[] = [
  { id: "HSCODEPRO", name: "hscodepro", description: "Gợi ý mã HS, biểu thuế MFN/FTA, VAT và chính sách quản lý chuyên ngành cho từng dòng hàng." },
  { id: "CUSTOMS_HUB", name: "Customs Hub (VNACCS)", description: "Truyền tờ khai IDA/IDC/EDA/EDC, gửi hồ sơ HYS, tra trạng thái IEX." },
  { id: "AI_PROVIDER", name: "Dịch vụ AI đọc chứng từ", description: "Đọc PDF scan/ảnh chứng từ. Do KhaiBáo AI vận hành, tính vào gói dịch vụ." },
  { id: "EINVOICE", name: "Tra cứu hóa đơn điện tử", description: "Lấy XML hóa đơn GTGT cước vận chuyển từ cổng Tổng cục Thuế – rẻ và chính xác hơn đọc PDF." },
];
