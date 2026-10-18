import { describe, expect, it } from "vitest";
import { BILL_SPLIT_FORM, EXPORT_IDENTIFIER_FORM, expandRepeat, fieldRole, IDENTIFIER_FORM, itemFields, LAYOUT_EDA, LAYOUT_IDA, type LayoutBlock, type LayoutField, type LayoutRepeat } from "./index.js";

const block = (layout: typeof LAYOUT_IDA, id: string) => layout.declarant.find((s) => s.id === "van-chuyen")!.blocks.find((b) => b.id === id)!;
const fields = (blocks: LayoutBlock[]): LayoutField[] => blocks.flatMap((b) => b.items.flatMap(itemFields));
const byKey = (blocks: LayoutBlock[], key: string) => fields(blocks).find((f) => f.key === key);

describe("Vận đơn – định danh đường biển / hàng không, HAWB, ngày vận đơn theo từng số", () => {
  it("IDA: mỗi dòng 1.26 = số vận đơn + ngày vận đơn + số HAWB (chỉ khi hàng không có HAWB)", () => {
    const vd = block(LAYOUT_IDA, "van-don");
    const bl = vd.items.find((it): it is LayoutRepeat => it.kind === "repeat" && it.no === "1.26")!;
    expect(expandRepeat(bl)[1]!.map((f) => f.key)).toEqual(["VD_BL2", "APP_NGAY_VD2", "APP_HAWB2"]);
    expect(bl.fields.find((f) => f.key === "APP_HAWB{n}")!.condition).toBe("HAS_HAWB");
    expect(fields([vd]).some((f) => f.key === "APP_NGAY_VD")).toBe(false);
  });
  it("IDA: lựa chọn định danh theo đường biển / hàng không; hỏi HAWB chỉ khi hàng không", () => {
    const vd = [block(LAYOUT_IDA, "van-don")];
    expect(byKey(vd, "APP_DD_PT")).toMatchObject({ input: "choice", options: [{ value: "BIEN" }, { value: "HANG_KHONG" }] });
    expect(byKey(vd, "APP_HAWB_CO")).toMatchObject({ input: "choice", condition: "AIR_IDENT", options: [{ value: "CO", label: "Có phát hành HAWB" }] });
    expect(byKey(vd, "APP_DD_PT")!.required).toBeUndefined();
  });
  it("EDA (theo ảnh tạo mới): chỉ một ô số vận đơn 2.24 – không ngày vận đơn, không chọn định danh, không HAWB", () => {
    const vd = [block(LAYOUT_EDA, "van-don")];
    expect(byKey(vd, "TK_EKN")).toMatchObject({ no: "2.24" });
    for (const k of ["APP_DD_PT", "APP_HAWB_CO", "APP_NGAY_VD", "APP_HAWB"]) expect(byKey(vd, k)).toBeUndefined();
  });
  it("EDA: chọn đường biển / hàng không nằm trong panel Khai mã định danh hàng hóa (không bắt buộc)", () => {
    expect(EXPORT_IDENTIFIER_FORM.id).toBe("dinh-danh");
    expect(EXPORT_IDENTIFIER_FORM.menu).toBe("Khai mã định danh hàng hóa");
    const f = byKey(EXPORT_IDENTIFIER_FORM.blocks, "APP_DD_PT");
    expect(f).toMatchObject({ input: "choice", options: [{ value: "BIEN" }, { value: "HANG_KHONG" }] });
    expect(f!.required).toBeUndefined();
    expect(fields(EXPORT_IDENTIFIER_FORM.blocks).map((x) => x.key)).toEqual(expect.arrayContaining(fields(IDENTIFIER_FORM.blocks).map((x) => x.key)));
    expect(EXPORT_IDENTIFIER_FORM.result).toBe(IDENTIFIER_FORM.result);
  });
});

describe("Nghiệp vụ đi kèm vận đơn – đủ chỉ tiêu theo đặc tả FPT", () => {
  it("Khai báo định danh (V5IdentifierReq): đủ ô khai, ô bắt buộc đánh dấu; kết quả do Hải quan trả về", () => {
    const keys = fields(IDENTIFIER_FORM.blocks).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["LOAI_DT", "LOAI_HH", "MA_DV", "TEN_DV", "MA_DAI_LY", "TEN_DAI_LY", "MA_HQ", "USER_ID"]));
    for (const k of ["LOAI_DT", "LOAI_HH", "MA_DV", "TEN_DV", "MA_HQ"]) expect(fieldRole("IDA", byKey(IDENTIFIER_FORM.blocks, k)!)).toBe("REQUIRED");
    expect(fieldRole("IDA", byKey(IDENTIFIER_FORM.blocks, "MA_DAI_LY")!)).toBe("OPTIONAL");
    const result = fields(IDENTIFIER_FORM.result);
    expect(result.map((f) => f.key)).toEqual(expect.arrayContaining(["REF_ID", "SO_TN", "NGAY_TN", "NAM_TN", "SO_DD", "NGAY_DD", "CODE_CONTENT", "TRANG_THAI", "KET_QUA"]));
    expect(result.every((f) => f.origin === "CUSTOMS")).toBe(true);
    expect(IDENTIFIER_FORM.result.every((b) => b.emptyNote)).toBe(true);
  });
  it("Chia tách vận đơn (TachVanDonReq): vận đơn gốc, vận đơn nhánh lặp, container của vận đơn nhánh chỉ khi hàng container", () => {
    const keys = fields(BILL_SPLIT_FORM.blocks).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["TVD_VD_GOC", "TVD_VD_GOC_NGAY", "TVD_NGUOIPHATHANH", "TVD_VDNHANH_SOLUONG", "TVD_LOAI", "TVD_LOAIHANG", "MA_DV", "TEN_DV", "MA_HQ", "USER_ID"]));
    for (const k of ["TVDN_VD_NHANH", "TVDN_NGUOIGUI_TEN", "TVDN_NGUOIGUI_DIACHI", "TVDN_NGUOINHAN_TEN", "TVDN_NGUOINHAN_DIACHI", "TVDN_CONT_LUONG", "TVDN_LUONG", "TVDN_LUONG_DVT", "TVDN_TRONGLUONG", "TVDN_TRONGLUONG_DVT"]) expect(keys).toContain(`${k}1`);
    expect(byKey(BILL_SPLIT_FORM.blocks, "TVDN_CONT_LUONG1")!.condition).toBe("SPLIT_CONTAINER");
    const cont = BILL_SPLIT_FORM.blocks.find((b) => b.id === "container-nhanh")!;
    expect(cont.condition).toBe("SPLIT_CONTAINER");
    expect(fields([cont]).map((f) => f.key)).toEqual(expect.arrayContaining(["TVDNC_SOCONT1", "TVDNC_SOSEAL1"]));
    expect(byKey(BILL_SPLIT_FORM.blocks, "TVD_LOAI")!.options!.map((o) => o.value)).toEqual(["1", "2"]);
    expect(fields(BILL_SPLIT_FORM.result).map((f) => f.key)).toEqual(expect.arrayContaining(["REF_ID", "SO_TN", "NGAY_TN", "TRANG_THAI", "KET_QUA"]));
  });
});
