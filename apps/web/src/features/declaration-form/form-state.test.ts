import type { DeclarationLayout, LayoutSection } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { conditionContext, isApplicable, itemProgress, missingRequired, sectionProgress, type FormValues } from "./form-state";

// Bố cục nhỏ dựng trong test: 1.4 bắt buộc, 1.10 theo tình huống tạm nhập, nhóm phương tiện có hô hiệu theo đường biển, 5 vận đơn.
const SECTION: LayoutSection = {
  id: "s", title: "S", blocks: [
    {
      id: "b", title: "B", items: [
        { kind: "field", key: "TK_ICB", label: "Mã loại hình", no: "1.4", input: "code" },
        { kind: "field", key: "TK_RED", label: "Thời hạn tái xuất", no: "1.10", input: "date", condition: "TEMP_IMPORT" },
        { kind: "group", label: "Phương tiện", no: "1.31", fields: [{ kind: "field", key: "VD_VSC", label: "Hô hiệu", input: "text", condition: "BY_WATER" }, { kind: "field", key: "VD_VSN", label: "Tên", input: "text" }] },
        { kind: "repeat", label: "Vận đơn", no: "1.26", count: 5, fields: [{ kind: "field", key: "VD_BL{n}", label: "Số vận đơn", input: "text" }] },
        { kind: "field", key: "TK_A09", label: "Ngày đăng ký", input: "date", origin: "CUSTOMS" },
      ],
    },
  ],
};
const base: FormValues = { TK_ICB: "A11", TK_MTC: "1", VD_BL1: "618-58265281" };

describe("conditionContext", () => {
  it("lấy loại hình theo mẫu, điều kiện giá viết hoa, có hóa đơn khi có số và không phải loại B", () => {
    expect(conditionContext("EDA", { TK_ECB: "B11", TK_IP2: "fob", TK_IV1: "A", TK_IV3: "X" })).toEqual({ typeCode: "B11", incoterm: "FOB", hasInvoice: true, transportCode: "" });
    expect(conditionContext("IDA", { TK_ICB: "G12", TK_MTC: "2", TK_IV1: "B", TK_IV3: "X" })).toMatchObject({ typeCode: "G12", transportCode: "2", hasInvoice: false });
  });
});

describe("sectionProgress", () => {
  it("A11 đường không: 1.10 và hô hiệu không áp dụng, không vào tổng; ô Hải quan không tính; nhóm lặp chỉ tính dòng 1", () => {
    // Áp dụng: TK_ICB, VD_VSN, VD_BL1 → 3; đã nhập: TK_ICB, VD_BL1 → 2.
    expect(sectionProgress("IDA", SECTION, base)).toEqual({ filled: 2, total: 3, missingRequired: 0 });
  });
  it("đổi sang tạm nhập G12 → 1.10 vào tổng và là ô bắt buộc còn thiếu", () => {
    expect(sectionProgress("IDA", SECTION, { ...base, TK_ICB: "G12" })).toEqual({ filled: 2, total: 4, missingRequired: 1 });
  });
  it("ô có giá trị nhưng không còn áp dụng không làm đã nhập vượt tổng", () => {
    const p = sectionProgress("IDA", SECTION, { ...base, TK_RED: "2027-01-31" });
    expect(p.filled).toBeLessThanOrEqual(p.total);
    expect(p).toEqual({ filled: 2, total: 3, missingRequired: 0 });
  });
  it("đường biển → hô hiệu áp dụng", () => {
    expect(sectionProgress("IDA", SECTION, { ...base, TK_MTC: "2" }).total).toBe(4);
  });
});

describe("missingRequired / isApplicable", () => {
  it("ô bắt buộc trống → thiếu; có giá trị (kể cả khoảng trắng bị bỏ) → không", () => {
    const icb = SECTION.blocks[0]!.items[0]!;
    if (icb.kind !== "field") throw new Error("test setup");
    expect(missingRequired("IDA", icb, { TK_ICB: "  " })).toBe(true);
    expect(missingRequired("IDA", icb, { TK_ICB: "A11" })).toBe(false);
  });
  it("không có điều kiện → luôn áp dụng", () => {
    expect(isApplicable({}, conditionContext("IDA", {}))).toBe(true);
  });
});

describe("itemProgress", () => {
  const layout = { kind: "IDA", summary: [], declarant: [], customs: [], item: { columns: [], customs: [], declarant: [{ id: "h", title: "H", items: [
    { kind: "field", key: "HAG_CMD", label: "HS", no: "1.74", input: "code" },
    { kind: "field", key: "HAG_CMN", label: "Mô tả", no: "1.78", input: "textarea" },
    { kind: "field", key: "HAG_GZC", label: "Mã quản lý riêng", no: "1.75", input: "text" },
  ] }] } } as DeclarationLayout;
  it("đếm ô bắt buộc còn thiếu của dòng hàng", () => {
    expect(itemProgress("IDA", layout, { HAG_CMD: "22083090" })).toEqual({ missing: 1 });
    expect(itemProgress("IDA", layout, { HAG_CMD: "22083090", HAG_CMN: "Rượu" })).toEqual({ missing: 0 });
  });
});
