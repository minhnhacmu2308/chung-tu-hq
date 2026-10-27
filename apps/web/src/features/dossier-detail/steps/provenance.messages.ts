// Nhãn nguồn gốc chỉ tiêu (Mặc định khai báo / giá trị cố định / nguồn doanh nghiệp chọn) – dùng bởi provenance.ts.
import { defineMessages } from "@kb/ui";

export const PROVENANCE_MESSAGES = defineMessages({
  vi: {
    "an.warehouse": "Kho / CY trên Arrival Notice",
    "transport.houseBillNo": "Vận đơn nhà (HB/L, HAWB)",
    "transport.masterBillNo": "Vận đơn chủ (MB/L, MAWB)",
    "transport.arrivalDate": "Ngày đến (ETA) trên Arrival Notice",
    "transport.departureDate": "Ngày đi (ngày B/L, ngày bay)",
    profile: "Theo Mặc định khai báo của doanh nghiệp",
    fixed: "Giá trị cố định doanh nghiệp đặt",
    chosen: "Nguồn doanh nghiệp chọn: {source}",
    profileSource: "Mặc định khai báo",
    lesson: "Bài học đã duyệt ở mục Dạy khai báo (từ tờ khai đã thông quan)",
  },
  en: {
    "an.warehouse": "Warehouse / CY on Arrival Notice",
    "transport.houseBillNo": "House bill (HB/L, HAWB)",
    "transport.masterBillNo": "Master bill (MB/L, MAWB)",
    "transport.arrivalDate": "Arrival date (ETA) on Arrival Notice",
    "transport.departureDate": "Departure date (B/L date, flight date)",
    profile: "Per the organization's declaration defaults",
    fixed: "Fixed value set by the organization",
    chosen: "Source chosen by the organization: {source}",
    profileSource: "Declaration defaults",
    lesson: "Approved lesson from Declaration teaching (cleared declarations)",
  },
  zh: {
    "an.warehouse": "到货通知上的仓库 / 堆场",
    "transport.houseBillNo": "分提单 (HB/L, HAWB)",
    "transport.masterBillNo": "主提单 (MB/L, MAWB)",
    "transport.arrivalDate": "到货通知上的到港日期 (ETA)",
    "transport.departureDate": "启运日期（提单日期、航班日期）",
    profile: "按企业申报默认设置",
    fixed: "企业设定的固定值",
    chosen: "企业选择的来源：{source}",
    profileSource: "申报默认设置",
    lesson: "申报教学中已审核的经验（来自已通关报关单）",
  },
});
