import { describe, expect, it } from "vitest";
import { fieldRole, LAYOUT_EDA, LAYOUT_IDA, type DeclarationLayout, type LayoutField } from "./index.js";

// Ngưỡng theo lưới 4 cột (~190px/ô, chữ 14px): nhãn "số · tên" từ 27 ký tự xuống dòng (vd "1.5 · Mã phân loại hàng hóa");
// nhãn ô "theo tình huống" có thêm " TH" (3 ký tự). Ô con trong nhóm / cột bảng nhóm lặp: rộng xs (112px) quá 15 ký tự, sm (160px) quá 22 ký tự.
const TOP_MAX = 26;
const topMax = (kind: "IDA" | "EDA", f: LayoutField) => (fieldRole(kind, f) === "CONDITIONAL" ? TOP_MAX - 3 : TOP_MAX);
const SUB_MAX = { xs: 15, sm: 22 } as const;
const title = (f: LayoutField, label: string) => (f.no ? `${f.no} · ${label}` : label);

function all(layout: DeclarationLayout) {
  const blocks = [...layout.declarant.flatMap((s) => s.blocks), ...layout.item.declarant];
  const top: LayoutField[] = [];
  const sub: LayoutField[] = [];
  for (const b of blocks) for (const it of b.items) {
    if (it.kind === "field") top.push(it);
    else sub.push(...it.fields);
  }
  return { top, sub };
}
const wide = (f: LayoutField) => f.input === "textarea" || f.input === "choice" || f.width === "lg" || f.width === "full";

describe.each([LAYOUT_IDA, LAYOUT_EDA])("$kind – nhãn dài có chữ viết tắt (bấm xem tên đầy đủ)", (layout) => {
  const { top, sub } = all(layout);
  it("ô thường: nhãn từ 27 ký tự có chữ viết tắt, viết tắt vừa một dòng", () => {
    const missing = top.filter((f) => !wide(f) && title(f, f.label).length > topMax(layout.kind, f) && !f.short).map((f) => title(f, f.label));
    expect(missing).toEqual([]);
    const tooLong = top.filter((f) => f.short && title(f, f.short).length > topMax(layout.kind, f)).map((f) => title(f, f.short!));
    expect(tooLong).toEqual([]);
  });
  it("ô con trong nhóm / cột bảng: nhãn quá bề rộng ô có chữ viết tắt", () => {
    const limit = (f: LayoutField) => (f.width === "xs" ? SUB_MAX.xs : f.width === "sm" || !f.width ? SUB_MAX.sm : Infinity);
    expect(sub.filter((f) => !wide(f) && f.label.length > limit(f) && !f.short).map((f) => f.label)).toEqual([]);
    expect(sub.filter((f) => f.short && f.short.length > limit(f)).map((f) => f.short)).toEqual([]);
  });
  it("chữ viết tắt khác tên đầy đủ; mã PLHH đúng ví dụ của người dùng", () => {
    expect([...top, ...sub].filter((f) => f.short && f.short === f.label).map((f) => f.key)).toEqual([]);
    expect(top.find((f) => f.key === "TK_CCC")?.short).toBe("Mã PLHH");
  });
});

// Theo file VIETTAT/TENVIETTAT.xlsx của người dùng: [khóa ô, chữ viết tắt, ý nghĩa hiện khi bấm]. Khóa "KEY=value" là một lựa chọn của ô.
const SHEET: [string, string, string][] = [
  ["APP_NHOM_LH=SXXK", "SXXK", "Loại hình sản xuất xuất khẩu"],
  ["TK_SKB", "Phân loại TC/CN", "Phân loại tổ chức cá nhân"],
  ["TK_CH", "Mã HQTN", "Mã hải quan tiếp nhận tờ khai"],
  ["TK_CHB", "Mã BPXLTK", "Mã bộ phận xử lý tờ khai"],
  ["TK_FIC", "Số TK gốc", "Số tờ khai đầu tiên khai báo"],
  ["APP_HAWB_CO", "HAWB", "Vận đơn thứ cấp"],
  ["VD_ST", "Mã ĐĐ LK CTQ", "Mã địa điểm lưu kho hàng chờ thông quan"],
  ["TK_ARP", "Mã ĐĐ VCBT", "Mã địa điểm đích vận chuyển bảo thuế"],
  ["TK_OL{n}", "Mã VB", "Mã văn bản áp dụng"],
  ["TK_SS{n}", "Mã PLGP", "Mã phân loại giấy phép"],
  ["APP_HDGC_SO", "Số HĐGC", "Số hợp đồng gia công"],
  ["TK_IV1", "PL HTHĐ", "Phân loại hình thức hóa đơn"],
  ["TK_IV2", "STN HĐĐT", "Số tiếp nhận hóa đơn điện tử. Chỉ tiêu này hiện không sử dụng để khai báo."],
  ["TK_IVP", "PTTT", "Phương thức thanh toán"],
  ["TK_IP1", "Mã PLHĐ", "Mã phân loại giá hóa đơn"],
  ["TK_IP2", "ĐKGH", "Điều kiện giao hàng"],
  ["TK_IP4", "Tổng TGHĐ", "Tổng trị giá hóa đơn"],
  ["TK_IP3", "Mã tiền tệ", "Mã tiền tệ theo giá hóa đơn"],
  ["KTG_VCC", "Mã tiền GCS", "Mã nguyên tệ giá cơ sở"],
  ["TK_TP", "Tổng HSPB Trị giá", "Tổng hệ số phân bổ trị giá"],
  ["KTG_FR2", "Mã tiền tệ", "Mã tiền tệ tính phí vận chuyển"],
  ["KTG_IN2", "Mã tiền tệ", "Mã tiền tệ tính phí bảo hiểm"],
  ["TK_TPM", "ĐT nộp thuế", "Đối tượng nộp thuế cho tờ khai"],
  ["TK_ENC", "Mã XĐTHNT", "Mã xác định thời hạn nộp thuế"],
  ["HAG_QT1", "ĐVT", "Đơn vị tính"],
  ["HAG_BPR", "Trị giá HĐ", "Trị giá hóa đơn"],
  ["APP_SL_THUC_TE", "SL Thực tế", "Số lượng thực tế hàng hóa"],
  ["APP_FOC=1", "FOC", "Là hàng khuyến mãi (FOC)"],
  ["HAG_OR", "Xuất xứ", "Xuất xứ hàng hóa"],
  ["HAG_TXA", "Mã thuế suất", "Mã thuế suất áp dụng"],
  ["HAG_TXC", "ĐVT", "Đơn vị tính"],
  ["APP_TGTT_TAY=1", "Tự nhập TGTT", "Sử dụng trị giá tính thuế thủ công do người khai cung cấp"],
  ["HAG_BPC", "Mã tiền tệ", "Mã tiền tệ sử dụng cho trị giá tính thuế thủ công"],
  ["HAG_TDL", "STT TK TN-TX", "Số thứ tự của dòng hàng trên tờ khai tạm nhập/tái xuất tương ứng"],
  ["HAG_TXN", "Mã miễn thuế", "Mã miễn thuế áp dụng cho dòng hàng"],
  ["HAG_TXR", "STT DMMT", "Số thứ tự của dòng hàng trên danh mục miễn thuế TEA đã đăng ký"],
];

describe("IDA – tên viết tắt theo file TENVIETTAT.xlsx", () => {
  const { top, sub } = all(LAYOUT_IDA);
  const fields = [...top, ...sub];
  it.each(SHEET)("%s → %s", (id, short, full) => {
    const [key, value] = id.split("=");
    const f = fields.find((x) => x.key === key);
    expect(f).toBeDefined();
    const target = value ? f!.options?.find((o) => o.value === value) : f!;
    expect(target).toMatchObject({ short, full });
  });
});
