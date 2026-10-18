import { describe, expect, it } from "vitest";
import { CATALOG_EDA } from "../declaration/catalog-eda.js";
import { CATALOG_IDA } from "../declaration/catalog-ida.js";
import { catalogFieldRole } from "../declaration/field-role.js";
import { VN_IDA_CTHQ_FIELDS, VN_IDA_FIELDS, VN_IDA_HANG_FIELDS, VN_IDA_KTG_FIELDS, VN_IDA_THUE_FIELDS, VN_IDA_TRANGTHAI_FIELDS, VN_IDA_VANDON_FIELDS } from "../fpt/ida.js";
import { VN_EDA_CON_FIELDS, VN_EDA_CTHQ_FIELDS, VN_EDA_FIELDS, VN_EDA_HANG_FIELDS, VN_EDA_TRANGTHAI_FIELDS } from "../fpt/eda.js";
import { expandRepeat, fieldRole, LAYOUT_EDA, LAYOUT_IDA, layoutFields, layoutFor, layoutNumbers, type DeclarationLayout, type LayoutBlock, type LayoutField } from "./index.js";

const SPEC_EDA = new Set([VN_EDA_FIELDS, VN_EDA_HANG_FIELDS, VN_EDA_CON_FIELDS, VN_EDA_CTHQ_FIELDS, VN_EDA_TRANGTHAI_FIELDS].flat().map((f) => f.name));
const SPEC_IDA = new Set([VN_IDA_FIELDS, VN_IDA_HANG_FIELDS, VN_IDA_VANDON_FIELDS, VN_IDA_KTG_FIELDS, VN_IDA_THUE_FIELDS, VN_IDA_CTHQ_FIELDS, VN_IDA_TRANGTHAI_FIELDS].flat().map((f) => f.name));

/** Mọi ô (đã expand) của các khối. */
const fieldsOf = (blocks: LayoutBlock[]): LayoutField[] => layoutFields({ kind: "IDA", summary: [], declarant: [{ id: "x", title: "x", blocks }], customs: [], item: { columns: [], declarant: [], customs: [] } });

describe.each([{ name: "IDA", layout: LAYOUT_IDA as DeclarationLayout, catalog: CATALOG_IDA, spec: SPEC_IDA, skip: ["1.46"] }, { name: "EDA", layout: LAYOUT_EDA as DeclarationLayout, catalog: CATALOG_EDA, spec: SPEC_EDA, skip: [] as string[] }])("bố cục $name", ({ layout, catalog, spec, skip }) => {
  it("có ô cho mọi chỉ tiêu Phụ lục II (trừ chỉ tiêu chưa sử dụng)", () => {
    const nos = layoutNumbers(layout);
    const missing = catalog.map((d) => d.no).filter((no) => !skip.includes(no) && !nos.has(no));
    expect(missing).toEqual([]);
  });
  it("không trùng khóa ô; ô đầu trang là ô của tab Hải quan (hiện lại để nhìn nhanh)", () => {
    const keys = layoutFields({ ...layout, summary: [] }).map((f) => f.key);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    const customsKeys = new Set(layout.customs.flatMap((s) => fieldsOf(s.blocks)).map((f) => f.key));
    expect(layout.summary.map((f) => f.key).filter((k) => !customsKeys.has(k))).toEqual([]);
  });
  it("khóa không có tiền tố APP_ phải có trong đặc tả VNACCS", () => {
    expect(layoutFields(layout).map((f) => f.key).filter((k) => !k.startsWith("APP_") && !spec.has(k))).toEqual([]);
  });
  it("ô Hải quan trả về chỉ ở đầu trang / tab Hải quan / phần Hải quan của dòng hàng", () => {
    const declarant = [...layout.declarant.flatMap((s) => fieldsOf(s.blocks)), ...fieldsOf(layout.item.declarant)];
    expect(declarant.filter((f) => f.origin === "CUSTOMS").map((f) => f.key)).toEqual([]);
    const customs = [...layout.summary, ...layout.customs.flatMap((s) => fieldsOf(s.blocks)), ...fieldsOf(layout.item.customs)];
    expect(customs.filter((f) => f.origin !== "CUSTOMS").map((f) => f.key)).toEqual([]);
  });
  it("khối Hải quan đều có câu giải thích khi chưa có dữ liệu", () => {
    expect(layout.customs.flatMap((s) => s.blocks).filter((b) => !b.emptyNote).map((b) => b.id)).toEqual([]);
  });
  it("cột bảng hàng là khóa có trong phần người khai của dòng hàng", () => {
    const keys = new Set(fieldsOf(layout.item.declarant).map((f) => f.key));
    expect(layout.item.columns.filter((c) => !keys.has(c))).toEqual([]);
  });
});

describe("expandRepeat", () => {
  it("{n} → 1..count, {nn} → 01..count, giữ thứ tự dòng", () => {
    const rows = expandRepeat({ kind: "repeat", label: "Vận đơn", count: 3, fields: [{ kind: "field", key: "VD_BL{n}", label: "Số vận đơn", input: "text" }] });
    expect(rows.map((r) => r.map((f) => f.key))).toEqual([["VD_BL1"], ["VD_BL2"], ["VD_BL3"]]);
    const cthq = expandRepeat({ kind: "repeat", label: "Chỉ thị", count: 10, fields: [{ kind: "field", key: "CTHQ_D{nn}", label: "Ngày", input: "date", origin: "CUSTOMS" }] });
    expect(cthq[0]![0]!.key).toBe("CTHQ_D01");
    expect(cthq[9]![0]!.key).toBe("CTHQ_D10");
  });
});

describe("fieldRole", () => {
  const def = (no: string) => CATALOG_IDA.find((d) => d.no === no)!;
  it("ô con không có số chỉ tiêu riêng → vai trò theo số chỉ tiêu của nhóm", () => {
    expect(fieldRole("IDA", { kind: "field", key: "TK_EP3", label: "Địa chỉ 3", input: "text" }, "1.22")).toBe(catalogFieldRole(def("1.22")));
  });
  it("ô Hải quan trả về → CUSTOMS; ô không có số → OPTIONAL", () => {
    expect(fieldRole("IDA", { kind: "field", key: "TK_A09", label: "Ngày đăng ký", input: "date", origin: "CUSTOMS" })).toBe("CUSTOMS");
    expect(fieldRole("IDA", { kind: "field", key: "APP_NGAY_VD", label: "Ngày vận đơn", input: "date" })).toBe("OPTIONAL");
  });
  it("ô có số chỉ tiêu riêng ưu tiên số của ô", () => {
    expect(fieldRole("IDA", { kind: "field", key: "TK_ICB", label: "Mã loại hình", no: "1.4", input: "code" }, "1.99")).toBe("REQUIRED");
  });
});

describe("EDA – container", () => {
  it("khối container: 5 mã địa điểm đóng hàng + 50 số container", () => {
    const keys = new Set(layoutFields(LAYOUT_EDA).map((f) => f.key));
    for (let i = 1; i <= 5; i++) expect(keys.has(`CON_VC${i}`)).toBe(true);
    for (let i = 1; i <= 50; i++) expect(keys.has(`CON_C${String(i).padStart(2, "0")}`)).toBe(true);
  });
  it("layoutFor chọn đúng mẫu", () => {
    expect(layoutFor("IDA")).toBe(LAYOUT_IDA);
    expect(layoutFor("EDA")).toBe(LAYOUT_EDA);
  });
});

describe("Đơn vị xuất nhập khẩu – ô ngắn chung một hàng", () => {
  // Ô chiếm cả hàng (tên, địa chỉ) đặt sau: các ô ngắn (mã, mã bưu chính, điện thoại, mã nước) nằm cùng một hàng ở đầu khối.
  const wideItem = (it: LayoutBlock["items"][number]) => it.kind !== "field" || it.input === "textarea" || it.width === "lg" || it.width === "full";
  const cases = [
    [LAYOUT_IDA, "nguoi-nhap-khau", ["1.12", "1.14", "1.16"]],
    [LAYOUT_IDA, "nguoi-xuat-khau", ["1.19", "1.21", "1.23"]],
    [LAYOUT_EDA, "nguoi-xuat-khau", ["2.11", "2.13", "2.15"]],
    [LAYOUT_EDA, "nguoi-nhap-khau", ["2.18", "2.20", "2.22"]],
  ] as const;
  it.each(cases.map(([l, id, nos]) => [`${l.kind} ${id}`, l, id, nos] as const))("%s", (_name, layout, id, shortNos) => {
    const block = layout.declarant.flatMap((s) => s.blocks).find((b) => b.id === id)!;
    const firstWide = block.items.findIndex(wideItem);
    const head = block.items.slice(0, firstWide);
    expect(head.map((it) => it.no)).toEqual(shortNos);
    expect(block.items.slice(firstWide).every(wideItem)).toBe(true);
  });
});

describe("Vận đơn – ô theo tình huống đầu khối có khung viền", () => {
  it("IDA: 1.35 số lượng container ngay cạnh ô HAWB; cả hai đóng khung", () => {
    const block = LAYOUT_IDA.declarant.flatMap((s) => s.blocks).find((b) => b.id === "van-don")!;
    const keys = block.items.map((it) => (it.kind === "field" ? it.key : it.label));
    expect(keys.indexOf("VD_COC")).toBe(keys.indexOf("APP_HAWB_CO") + 1);
    const framed = block.items.filter((it) => it.kind === "field" && it.framed).map((it) => (it as LayoutField).key);
    expect(framed).toEqual(["APP_HAWB_CO", "VD_COC"]);
  });
});
