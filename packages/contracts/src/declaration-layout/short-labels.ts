// Chữ viết tắt cho nhãn dài làm vỡ lưới form (bấm chữ viết tắt trên giao diện để xem tên đầy đủ). Một nơi để rà soát.
// Quy ước viết tắt nghiệp vụ Hải quan: PL phân loại · HH hàng hóa · PTVC phương thức vận chuyển · VC vận chuyển · HĐ hóa đơn · TK tờ khai
// NK / XK nhập / xuất khẩu · ĐĐ địa điểm · TQ thông quan · CT chứng từ · NH ngân hàng · PH phát hành · TN tiếp nhận · KQ KT kết quả kiểm tra
// DM danh mục · KH ký hiệu · TĐ tuyệt đối · MST mã số thuế · DN doanh nghiệp · QL quản lý · PB phân bổ · TGTT trị giá tính thuế · ĐK điều kiện · ĐVT đơn vị tính · PP phương pháp.
// Một số lấy đúng nhãn của phần mềm khai báo (ảnh CHITIEU_*): "Số QL nội bộ DN", "Mã KQ KT nội dung", "Số vận đơn".
// Khóa = key ô (ô nhóm lặp dùng key mẫu có {n}). Test short-labels.test.ts bắt nhãn dài chưa có chữ viết tắt.
import type { DeclarationLayout, LayoutBlock, LayoutField, LayoutItem } from "./types.js";

const COMMON: Record<string, string> = {
  TK_CCC: "Mã PLHH",
  TK_MTC: "Mã PTVC",
  TK_SKB: "PL cá nhân/tổ chức",
  TK_CHB: "Bộ phận xử lý TK",
  TK_ICD: "Ngày khai (dự kiến)",
  TK_ECD: "Ngày khai (dự kiến)",
  TK_IMC: "Mã người NK (MST)",
  TK_NMC: "Mã ủy thác NK",
  TK_NMN: "Tên ủy thác NK",
  TK_ENM: "Tên ủy thác XK",
  TK_EXC: "Mã ủy thác XK",
  TK_EXN: "Tên ủy thác XK",
  VD_ST: "ĐĐ lưu kho chờ TQ",
  TK_ST: "ĐĐ lưu kho chờ TQ",
  VD_ISD: "Ngày nhập kho",
  TK_EKN: "Số vận đơn",
  TK_N4: "Mã KQ KT nội dung",
  TK_DPD: "Ngày khởi hành",
  TK_SYM: "Ngày đi dự kiến",
  TK_RID: "Thời hạn tái NK",
  TK_RED: "Hạn tái xuất",
  TK_BP: "Mã lý do BP",
  HAG_KWS: "Ngoài hạn ngạch",
  TK_IV1: "PL hình thức HĐ",
  TK_IV2: "Số TN HĐ điện tử",
  TK_IVP: "PT thanh toán",
  KTG_VD1: "Mã PL trị giá",
  TK_CNV: "Không quy đổi VND",
  TK_ENC: "Mã hạn nộp thuế",
  TK_BRC: "Mã NH trả thay",
  TK_SBC: "Mã NH bảo lãnh",
  TK_BYA: "Năm PH hạn mức",
  TK_RYA: "Năm PH bảo lãnh",
  TK_BCM: "KH CT hạn mức",
  TK_SCM: "KH CT bảo lãnh",
  TK_BCN: "Số CT hạn mức",
  TK_SCN: "Số CT bảo lãnh",
  TK_REF: "Số QL nội bộ DN",
  // Dòng hàng
  HAG_TXA: "Thuế suất nhập tay",
  HAG_TDL: "STT dòng TN-TX",
  HAG_TXR: "Dòng trong DM",
  HAG_ADE: "Dòng trong DM",
  HAG_SPD: "Mã thuế TĐ",
  HAG_ORS: "Mã biểu thuế NK",
  HAG_B29: "Mã PL tái XN giá",
  HAG_R03: "Mã PL tái XN giá",
  // Ô con trong nhóm / cột bảng nhóm lặp
  TK_IP1: "Mã PL giá HĐ",
  TK_IP2: "ĐK giao hàng",
  KTG_A95: "PP điều chỉnh",
  KTG_A93: "Công thức",
  KTG_VCC: "Mã tiền giá CS",
  HAG_TSC: "ĐVT đơn giá",
  "TK_EA{n}": "PL đính kèm",
  "TK_SS{n}": "Mã PL giấy phép",
  "HAG_TR{n}": "Mã miễn giảm thuế",
};

const BY_KIND: Record<DeclarationLayout["kind"], Record<string, string>> = {
  IDA: {
    TK_TDN: "Số TK tạm xuất",
    TK_TP: "Tổng hệ số PB TG",
    HAG_RE: "Mã miễn giảm NK",
    HAG_REG: "Tiền giảm NK",
    HAG_TXN: "DM miễn thuế NK",
  },
  EDA: {
    TK_EPC: "Mã người XK (MST)",
    TK_TDN: "Số TK tạm nhập",
    TK_TP: "Tổng hệ số PB TGTT",
    HAG_RE: "Mã miễn giảm XK",
    HAG_REG: "Tiền giảm XK",
    HAG_TXN: "DM miễn thuế XK",
  },
};

/** Gắn `short` cho các ô có trong bảng viết tắt (phần người khai và dòng hàng). */
export function withShortLabels(layout: DeclarationLayout): DeclarationLayout {
  const map = { ...COMMON, ...BY_KIND[layout.kind] };
  const field = (f: LayoutField): LayoutField => (map[f.key] ? { ...f, short: map[f.key]! } : f);
  const item = (it: LayoutItem): LayoutItem => (it.kind === "field" ? field(it) : { ...it, fields: it.fields.map(field) });
  const block = (b: LayoutBlock): LayoutBlock => ({ ...b, items: b.items.map(item) });
  return {
    ...layout,
    declarant: layout.declarant.map((s) => ({ ...s, blocks: s.blocks.map(block) })),
    item: { ...layout.item, declarant: layout.item.declarant.map(block) },
  };
}
