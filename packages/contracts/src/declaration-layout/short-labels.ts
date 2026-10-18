// Chữ viết tắt cho nhãn dài làm vỡ lưới form (bấm chữ viết tắt trên giao diện để xem tên đầy đủ / ý nghĩa). Một nơi để rà soát.
// Nguồn: VIETTAT/TENVIETTAT.xlsx của người dùng (mục a(chữ viết tắt, ý nghĩa)); các mục chỉ có chữ viết tắt thì bấm vào hiện nhãn gốc.
// Quy ước viết tắt nghiệp vụ Hải quan: PL phân loại · HH hàng hóa · PTVC phương thức vận chuyển · VC vận chuyển · HĐ hóa đơn · TK tờ khai
// NK / XK nhập / xuất khẩu · ĐĐ địa điểm · TQ thông quan · CT chứng từ · NH ngân hàng · PH phát hành · TN tiếp nhận · KQ KT kết quả kiểm tra
// DM danh mục · KH ký hiệu · TĐ tuyệt đối · MST mã số thuế · DN doanh nghiệp · QL quản lý · PB phân bổ · TGTT trị giá tính thuế · ĐK điều kiện · ĐVT đơn vị tính · PP phương pháp.
// Khóa = key ô (ô nhóm lặp dùng key mẫu có {n}); "KEY=value" = một lựa chọn của ô. Test short-labels.test.ts bắt nhãn dài chưa có chữ viết tắt.
import type { DeclarationLayout, FieldOption, LayoutBlock, LayoutField, LayoutItem } from "./types.js";

type Abbr = string | { short: string; full: string };
/** Chữ viết tắt kèm ý nghĩa hiện khi bấm. */
const a = (short: string, full: string): Abbr => ({ short, full });

const COMMON: Record<string, Abbr> = {
  TK_CCC: "Mã PLHH",
  TK_MTC: "Mã PTVC",
  TK_SKB: a("Phân loại TC/CN", "Phân loại tổ chức cá nhân"),
  TK_CH: a("Mã HQTN", "Mã hải quan tiếp nhận tờ khai"),
  TK_CHB: a("Mã BPXLTK", "Mã bộ phận xử lý tờ khai"),
  TK_FIC: a("Số TK gốc", "Số tờ khai đầu tiên khai báo"),
  TK_ICD: "Ngày khai (dự kiến)",
  TK_ECD: "Ngày khai (dự kiến)",
  TK_IMC: "Mã người NK (MST)",
  TK_NMC: "Mã ủy thác NK",
  TK_NMN: "Tên ủy thác NK",
  TK_ENM: "Tên ủy thác XK",
  TK_EXC: "Mã ủy thác XK",
  TK_EXN: "Tên ủy thác XK",
  APP_HAWB_CO: a("HAWB", "Vận đơn thứ cấp"),
  VD_ST: a("Mã ĐĐ LK CTQ", "Mã địa điểm lưu kho hàng chờ thông quan"),
  TK_ST: a("Mã ĐĐ LK CTQ", "Mã địa điểm lưu kho hàng chờ thông quan"),
  VD_ISD: "Ngày nhập kho",
  TK_EKN: "Số vận đơn",
  TK_N4: "Mã KQ KT nội dung",
  TK_DPD: "Ngày khởi hành",
  TK_SYM: "Ngày đi dự kiến",
  TK_RID: "Thời hạn tái NK",
  TK_RED: "Hạn tái xuất",
  TK_BP: "Mã lý do BP",
  HAG_KWS: "Ngoài hạn ngạch",
  TK_IV1: a("PL HTHĐ", "Phân loại hình thức hóa đơn"),
  TK_IV2: a("STN HĐĐT", "Số tiếp nhận hóa đơn điện tử. Chỉ tiêu này hiện không sử dụng để khai báo."),
  TK_IVP: a("PTTT", "Phương thức thanh toán"),
  KTG_VD1: "Mã PL trị giá",
  TK_CNV: "Không quy đổi VND",
  TK_TPM: a("ĐT nộp thuế", "Đối tượng nộp thuế cho tờ khai"),
  TK_ENC: a("Mã XĐTHNT", "Mã xác định thời hạn nộp thuế"),
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
  HAG_QT1: a("ĐVT", "Đơn vị tính"),
  HAG_QT2: a("ĐVT", "Đơn vị tính"),
  HAG_BPR: a("Trị giá HĐ", "Trị giá hóa đơn"),
  APP_SL_THUC_TE: a("SL Thực tế", "Số lượng thực tế hàng hóa"),
  HAG_OR: a("Xuất xứ", "Xuất xứ hàng hóa"),
  HAG_TXA: a("Mã thuế suất", "Mã thuế suất áp dụng"),
  HAG_TDL: a("STT TK TN-TX", "Số thứ tự của dòng hàng trên tờ khai tạm nhập/tái xuất tương ứng"),
  HAG_TXN: a("Mã miễn thuế", "Mã miễn thuế áp dụng cho dòng hàng"),
  HAG_TXR: a("STT DMMT", "Số thứ tự của dòng hàng trên danh mục miễn thuế TEA đã đăng ký"),
  HAG_ADE: a("STT DMMT", "Số thứ tự của dòng hàng trên danh mục miễn thuế TEA đã đăng ký"),
  HAG_SPD: "Mã thuế TĐ",
  HAG_ORS: "Mã biểu thuế NK",
  HAG_B29: "Mã PL tái XN giá",
  HAG_R03: "Mã PL tái XN giá",
  // Ô con trong nhóm / cột bảng nhóm lặp
  TK_ARP: a("Mã ĐĐ VCBT", "Mã địa điểm đích vận chuyển bảo thuế"),
  APP_HDGC_SO: a("Số HĐGC", "Số hợp đồng gia công"),
  TK_IP1: a("Mã PLHĐ", "Mã phân loại giá hóa đơn"),
  TK_IP2: a("ĐKGH", "Điều kiện giao hàng"),
  TK_IP4: a("Tổng TGHĐ", "Tổng trị giá hóa đơn"),
  TK_IP3: a("Mã tiền tệ", "Mã tiền tệ theo giá hóa đơn"),
  KTG_A95: "PP điều chỉnh",
  KTG_A93: "Công thức",
  KTG_VCC: a("Mã tiền GCS", "Mã nguyên tệ giá cơ sở"),
  KTG_FR2: a("Mã tiền tệ", "Mã tiền tệ tính phí vận chuyển"),
  KTG_IN2: a("Mã tiền tệ", "Mã tiền tệ tính phí bảo hiểm"),
  HAG_TSC: "ĐVT đơn giá",
  HAG_TXC: a("ĐVT", "Đơn vị tính"),
  HAG_BPC: a("Mã tiền tệ", "Mã tiền tệ sử dụng cho trị giá tính thuế thủ công"),
  "TK_EA{n}": "PL đính kèm",
  "TK_OL{n}": a("Mã VB", "Mã văn bản áp dụng"),
  "TK_SS{n}": a("Mã PLGP", "Mã phân loại giấy phép"),
  "HAG_TR{n}": "Mã miễn giảm thuế",
  // Lựa chọn của ô (radio / checkbox)
  "APP_NHOM_LH=SXXK": a("SXXK", "Loại hình sản xuất xuất khẩu"),
  "APP_FOC=1": a("FOC", "Là hàng khuyến mãi (FOC)"),
  "APP_TGTT_TAY=1": a("Tự nhập TGTT", "Sử dụng trị giá tính thuế thủ công do người khai cung cấp"),
};

const BY_KIND: Record<DeclarationLayout["kind"], Record<string, Abbr>> = {
  IDA: {
    TK_TDN: "Số TK tạm xuất",
    TK_TP: a("Tổng HSPB Trị giá", "Tổng hệ số phân bổ trị giá"),
    HAG_RE: "Mã miễn giảm NK",
    HAG_REG: "Tiền giảm NK",
  },
  EDA: {
    TK_EPC: "Mã người XK (MST)",
    TK_TDN: "Số TK tạm nhập",
    TK_TP: "Tổng hệ số PB TGTT",
    HAG_RE: "Mã miễn giảm XK",
    HAG_REG: "Tiền giảm XK",
  },
};

const toProps = (x: Abbr) => (typeof x === "string" ? { short: x } : x);

/** Gắn `short` (+ `full`) cho các ô và lựa chọn có trong bảng viết tắt (phần người khai và dòng hàng). */
export function withShortLabels(layout: DeclarationLayout): DeclarationLayout {
  const map = { ...COMMON, ...BY_KIND[layout.kind] };
  const option = (key: string) => (o: FieldOption): FieldOption => {
    const x = map[`${key}=${o.value}`];
    return x ? { ...o, ...toProps(x) } : o;
  };
  const field = (f: LayoutField): LayoutField => {
    const x = map[f.key];
    const withOptions = f.options ? { ...f, options: f.options.map(option(f.key)) } : f;
    return x ? { ...withOptions, ...toProps(x) } : withOptions;
  };
  const item = (it: LayoutItem): LayoutItem => (it.kind === "field" ? field(it) : { ...it, fields: it.fields.map(field) });
  const block = (b: LayoutBlock): LayoutBlock => ({ ...b, items: b.items.map(item) });
  return {
    ...layout,
    declarant: layout.declarant.map((s) => ({ ...s, blocks: s.blocks.map(block) })),
    item: { ...layout.item, declarant: layout.item.declarant.map(block) },
  };
}
