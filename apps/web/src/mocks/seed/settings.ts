// Dữ liệu mẫu Tài khoản & tích hợp. Khóa API bên thứ 3 nằm ở server (secret store) – không bao giờ có ở đây.
import type { DigitalCertificate, Integration } from "../types";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export function seedSettings(): { integrations: Integration[]; certificates: DigitalCertificate[] } {
  return {
    integrations: [
      {
        id: "HSCODEPRO",
        name: "hscodepro",
        description: "Gợi ý mã HS, biểu thuế MFN/FTA, VAT và chính sách quản lý chuyên ngành cho từng dòng hàng.",
        status: "CONNECTED",
        lastCheckedAt: hoursAgo(0.4),
        detail: "API /v1/classify · độ trễ trung bình 820 ms · 1.284 lượt tra tháng này",
      },
      {
        id: "CUSTOMS_HUB",
        name: "Customs Hub (VNACCS)",
        description: "Truyền tờ khai IDA/IDC/EDA/EDC, gửi hồ sơ HYS, tra trạng thái IEX.",
        status: "ERROR",
        lastCheckedAt: hoursAgo(2),
        detail: "Chứng thư số mặc định sắp hết hạn – Customs Hub từ chối ký thử (mã E-CERT-EXPIRING).",
      },
      {
        id: "AI_PROVIDER",
        name: "Dịch vụ AI đọc chứng từ",
        description: "Đọc PDF scan/ảnh chứng từ. Do KhaiBáo AI vận hành, tính vào gói dịch vụ.",
        status: "CONNECTED",
        lastCheckedAt: hoursAgo(0.1),
        detail: "Claude (mặc định) · 412 trang đã đọc tháng này",
      },
      {
        id: "EINVOICE",
        name: "Tra cứu hóa đơn điện tử",
        description: "Lấy XML hóa đơn GTGT cước vận chuyển từ cổng Tổng cục Thuế – rẻ và chính xác hơn đọc PDF.",
        status: "NOT_CONFIGURED",
      },
    ],
    certificates: [
      {
        id: "cert_vnpt",
        subject: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT",
        issuer: "VNPT-CA",
        serial: "5401 0A3F 9C21 77E0",
        validTo: "2027-12-18",
        isDefault: false,
      },
      {
        id: "cert_viettel",
        subject: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT",
        issuer: "Viettel-CA",
        serial: "7A12 004B E3D9 1188",
        validTo: inDays(20),
        isDefault: true,
      },
    ],
  };
}
