import { describe, expect, it } from "vitest";
import { itemFields, LAYOUT_EDA, LAYOUT_IDA, type DeclarationLayout, type LayoutBlock, type LayoutField, type LayoutRepeat } from "./index.js";

// Ô có trên màn hình tạo mới của phần mềm khai báo (CHITIEU_NHAPKHAU_TAOMOI / CHITIEU_XUATKHAU_TAOMOI) mà bản mẫu trước đây còn thiếu.
const declarantBlock = (layout: DeclarationLayout, id: string) => layout.declarant.flatMap((s) => s.blocks).find((b) => b.id === id)!;
const itemBlock = (layout: DeclarationLayout, id: string) => layout.item.declarant.find((b) => b.id === id)!;
const fields = (b: LayoutBlock): LayoutField[] => b.items.flatMap(itemFields);
const byKey = (b: LayoutBlock, key: string) => fields(b).find((f) => f.key === key);

describe.each([LAYOUT_IDA, LAYOUT_EDA])("$kind – chỉ tiêu theo ảnh tạo mới", (layout) => {
  it("Nhóm loại hình (Kinh doanh / SXXK / Gia công / Chế xuất) đứng đầu khối Tờ khai, luôn chọn một", () => {
    const b = declarantBlock(layout, "to-khai");
    expect(b.items[0]).toMatchObject({ key: "APP_NHOM_LH", input: "choice", required: true });
    expect(byKey(b, "APP_NHOM_LH")!.options!.map((o) => o.label)).toEqual(["Kinh doanh", "Sản xuất xuất khẩu", "Gia công", "Chế xuất"]);
  });
  it("chỉ tiêu bộ phận xử lý tờ khai đặt tên như phần mềm", () => {
    expect(byKey(declarantBlock(layout, "to-khai"), "TK_CHB")!.label).toBe("Bộ phận xử lý tờ khai");
  });
  it("dòng hàng: số lượng thực tế, hàng FOC; trị giá tính thuế chỉ nhập khi chọn tự nhập (Manual)", () => {
    const all = layout.item.declarant.flatMap(fields);
    const key = (k: string) => all.find((f) => f.key === k);
    expect(key("APP_SL_THUC_TE")).toMatchObject({ input: "number" });
    expect(key("APP_FOC")).toMatchObject({ input: "choice", options: [{ value: "1" }] });
    expect(key("APP_TGTT_TAY")).toMatchObject({ input: "choice", options: [{ value: "1" }] });
    expect(key("APP_FOC")!.required).toBeUndefined();
    const manual = layout.item.declarant.flatMap((b) => b.items).find((it) => it.kind === "group" && it.fields.some((f) => f.key === "HAG_DPR"));
    expect(manual).toMatchObject({ condition: "MANUAL_VALUE" });
  });
});

describe("riêng từng loại tờ khai", () => {
  it("IDA: mỗi khoản điều chỉnh 1.49 có ô phân bổ phí cho tất cả dòng hàng", () => {
    const r = declarantBlock(LAYOUT_IDA, "dieu-chinh").items.find((it): it is LayoutRepeat => it.kind === "repeat" && it.no === "1.49")!;
    expect(r.fields.map((f) => f.key)).toContain("APP_PB{n}");
    expect(r.fields.find((f) => f.key === "APP_PB{n}")).toMatchObject({ input: "choice", options: [{ value: "1" }] });
  });
  it("EDA: dòng hàng có ô xuất xứ (bảng mã nước)", () => {
    expect(byKey(itemBlock(LAYOUT_EDA, "hang"), "APP_XUAT_XU")).toMatchObject({ input: "code", codeTable: "COUNTRY" });
  });
  it("EDA: khối Container có thao tác chép số container từ tờ khai khác", () => {
    expect(declarantBlock(LAYOUT_EDA, "container").actions).toEqual([{ id: "copy-cont", label: "Copy số cont từ tờ khai khác" }]);
  });
});
