import { LAYOUT_EDA, type DeclarationLayout, type LayoutSection } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { choiceControl, conditionContext, toggleChoice, groupMissing, isApplicable, itemProgress, missingRequired, sectionProgress, type FormValues } from "./form-state";

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
    expect(conditionContext("EDA", { TK_ECB: "B11", TK_IP2: "fob", TK_IV1: "A", TK_IV3: "X" })).toEqual({ typeCode: "B11", incoterm: "FOB", hasInvoice: true, transportCode: "", identMode: "", hawbIssued: false, splitCargo: "" });
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
    expect(missingRequired("IDA", icb, { TK_ICB: "  " }, undefined, undefined, conditionContext("IDA", {}))).toBe(true);
    expect(missingRequired("IDA", icb, { TK_ICB: "A11" }, undefined, undefined, conditionContext("IDA", {}))).toBe(false);
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

describe("review: bộ đếm khớp với ô, không báo thiếu ô không áp dụng", () => {
  const eda = LAYOUT_EDA.declarant.find((s) => s.id === "van-chuyen")!;
  const base: FormValues = { TK_ECB: "B11", TK_MTC: "2", TK_EKN: "X", TK_NO: "1", TK_NOT: "PK", TK_GW: "1", TK_GWT: "KGM", TK_ST: "06B1A04", TK_DSC: "SGSIN", TK_DSN: "SINGAPORE", TK_PSC: "VNSGN", TK_SYM: "2026-09-12", TK_VSN: "A" };
  it("EDA đường biển container: 2.59 (một địa điểm đóng hàng) tính 1 ô thiếu, không phải 7; số container 1; hô hiệu 1", () => {
    expect(sectionProgress("EDA", eda, base).missingRequired).toBe(3);
    // Có một mã địa điểm đóng hàng là đủ 2.59.
    expect(sectionProgress("EDA", eda, { ...base, CON_VC1: "02CIS01" }).missingRequired).toBe(2);
  });
  it("ô thuộc nhóm có điều kiện không áp dụng → không 'Còn thiếu' (EDA FOB có hóa đơn: 2.40)", () => {
    const tg = LAYOUT_EDA.declarant.flatMap((s) => s.blocks).find((b) => b.id === "tri-gia")!.items[0]!;
    if (tg.kind !== "group") throw new Error("test setup");
    const v: FormValues = { TK_ECB: "B11", TK_IP2: "FOB", TK_IV1: "A", TK_IV3: "INV-1" };
    expect(missingRequired("EDA", tg.fields[1]!, v, tg.no, tg.condition, conditionContext("EDA", v))).toBe(false);
    const cif = { ...v, TK_IP2: "CIF" };
    expect(missingRequired("EDA", tg.fields[1]!, cif, tg.no, tg.condition, conditionContext("EDA", cif))).toBe(true);
  });
  it("nhóm 'chỉ cần một ô' (2.59) báo thiếu ở cấp nhóm", () => {
    const g = eda.blocks.find((b) => b.id === "container")!.items[0]!;
    if (g.kind !== "group") throw new Error("test setup");
    expect(groupMissing("EDA", g, base, conditionContext("EDA", base), "IN_CONTAINER")).toBe(true);
    expect(groupMissing("EDA", g, { ...base, CON_VN: "Kho X" }, conditionContext("EDA", base), "IN_CONTAINER")).toBe(false);
  });
});

describe("conditionContext – ô riêng của phần mềm", () => {
  it("đọc định danh theo đường biển/hàng không, có HAWB, loại hàng khi tách vận đơn", () => {
    expect(conditionContext("IDA", { APP_DD_PT: "HANG_KHONG", APP_HAWB_CO: "CO", TVD_LOAIHANG: "1" })).toMatchObject({ identMode: "HANG_KHONG", hawbIssued: true, splitCargo: "1" });
    expect(conditionContext("IDA", { APP_DD_PT: "BIEN", APP_HAWB_CO: "KHONG" })).toMatchObject({ identMode: "BIEN", hawbIssued: false, splitCargo: "" });
  });
  it("ô Số HAWB bắt buộc ở dòng vận đơn 1 chỉ khi hàng không có HAWB", () => {
    const hawb = { kind: "field", key: "APP_HAWB1", label: "Số HAWB", input: "text", condition: "HAS_HAWB" } as const;
    const air = { APP_DD_PT: "HANG_KHONG", APP_HAWB_CO: "CO" };
    expect(missingRequired("IDA", hawb, air, "1.26", undefined, conditionContext("IDA", air))).toBe(true);
    const noHawb = { ...air, APP_HAWB_CO: "KHONG" };
    expect(missingRequired("IDA", hawb, noHawb, "1.26", undefined, conditionContext("IDA", noHawb))).toBe(false);
  });
});

describe("ô lựa chọn – radio hay checkbox", () => {
  it("không bắt buộc → checkbox (bỏ chọn được); bắt buộc → radio", () => {
    expect(choiceControl("IDA", { kind: "field", key: "APP_DD_PT", label: "Định danh", input: "choice" })).toBe("checkbox");
    expect(choiceControl("IDA", { kind: "field", key: "LOAI_DT", label: "Loại đối tượng", input: "choice", required: true })).toBe("radio");
  });
  it("toggleChoice: chọn ô khác → đổi sang ô đó; bấm lại ô đang chọn → bỏ chọn", () => {
    expect(toggleChoice("", "BIEN")).toBe("BIEN");
    expect(toggleChoice("BIEN", "HANG_KHONG")).toBe("HANG_KHONG");
    expect(toggleChoice("HANG_KHONG", "HANG_KHONG")).toBe("");
  });
});
