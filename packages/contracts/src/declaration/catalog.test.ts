import { describe, expect, it } from "vitest";
import { CATALOG_EDA } from "./catalog-eda.js";
import { CATALOG_IDA } from "./catalog-ida.js";
import { DeclarationFieldDefSchema, type DeclarationFieldDef } from "./catalog-types.js";
import {
  COUNTRIES, CURRENCIES, CUSTOMS_OFFICES, INCOTERMS, INVOICE_KINDS, PACKAGE_UNITS, PAYMENT_METHODS,
  PRICE_KINDS, TRANSPORT_MODES, TYPE_CODES_NK, TYPE_CODES_XK, UNITS,
} from "./code-tables.js";

const FPT_FIELD = /^(VN_IDA|VN_IDA_VANDON|VN_IDA_KTG|VN_IDA_HANG|VN_IDA_CTHQ|VN_EDA|VN_EDA_HANG|VN_EDA_CON|VN_EDA_CTHQ)\.[A-Z0-9_]+$/;
const minor = (no: string) => Number(no.split(".")[1]);
const byNo = (catalog: DeclarationFieldDef[], no: string) => {
  const field = catalog.find((x) => x.no === no);
  if (!field) throw new Error(`Không có chỉ tiêu ${no}`);
  return field;
};

describe.each([
  { name: "CATALOG_IDA (Mẫu 01)", catalog: CATALOG_IDA, form: "01", major: "1", min: 90, objects: /^VN_IDA/ },
  { name: "CATALOG_EDA (Mẫu 02)", catalog: CATALOG_EDA, form: "02", major: "2", min: 60, objects: /^VN_EDA/ },
])("$name", ({ catalog, form, major, min, objects }) => {
  it(`có ít nhất ${min} chỉ tiêu, liên tục từ ${major}.1`, () => {
    expect(catalog.length).toBeGreaterThanOrEqual(min);
    // Phụ lục II đánh số liên tục, không bỏ số.
    catalog.forEach((field, i) => expect(field.no).toBe(`${major}.${i + 1}`));
  });
  it("không trùng no, no tăng dần theo phần số sau dấu chấm", () => {
    expect(new Set(catalog.map((x) => x.no)).size).toBe(catalog.length);
    for (let i = 1; i < catalog.length; i++) expect(minor(catalog[i]!.no)).toBeGreaterThan(minor(catalog[i - 1]!.no));
  });
  it("mọi phần tử parse qua DeclarationFieldDefSchema, đúng mẫu", () => {
    for (const field of catalog) {
      expect(DeclarationFieldDefSchema.parse(field)).toEqual(field);
      expect(field.form).toBe(form);
    }
  });
  it("fptField đúng dạng và thuộc object của đúng mẫu tờ khai; fptField không trùng", () => {
    const fpt = catalog.flatMap((x) => (x.fptField ? [x.fptField] : []));
    for (const name of fpt) {
      expect(name).toMatch(FPT_FIELD);
      expect(name).toMatch(objects);
    }
    expect(new Set(fpt).size).toBe(fpt.length);
  });
  it("legalNote ≤ 300 ký tự, nhãn không rỗng", () => {
    for (const field of catalog) {
      expect(field.label.trim()).not.toBe("");
      expect((field.legalNote ?? "").length, field.no).toBeLessThanOrEqual(300);
    }
  });
});

describe("Chỉ tiêu then chốt Mẫu 01 (nhập khẩu)", () => {
  it.each([
    ["1.4", "Mã loại hình", "VN_IDA.TK_ICB"],
    ["1.6", "Mã hiệu phương thức vận chuyển", "VN_IDA.TK_MTC"],
    ["1.8", "Cơ quan Hải quan", "VN_IDA.TK_CH"],
    ["1.12", "Mã người nhập khẩu", "VN_IDA.TK_IMC"], // MST người nhập khẩu
    ["1.20", "Tên người xuất khẩu", "VN_IDA.TK_EPN"],
    ["1.26", "Số vận đơn (Số B/L, số AWB v.v.)", "VN_IDA_VANDON.VD_BL1"],
    ["1.27", "Số lượng", "VN_IDA_VANDON.VD_NO"], // số lượng kiện + mã loại kiện (VD_NOT)
    ["1.28", "Tổng trọng lượng hàng (Gross)", "VN_IDA_VANDON.VD_GW"],
    ["1.29", "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", "VN_IDA_VANDON.VD_ST"],
    ["1.31", "Phương tiện vận chuyển", "VN_IDA_VANDON.VD_VSC"],
    ["1.32", "Ngày hàng đến", "VN_IDA_VANDON.VD_ARR"],
    ["1.33", "Địa điểm dỡ hàng", "VN_IDA_VANDON.VD_DST"],
    ["1.34", "Địa điểm xếp hàng", "VN_IDA_VANDON.VD_PSC"],
    ["1.37", "Mã văn bản pháp quy khác", "VN_IDA.TK_OL1"],
    ["1.41", "Số hóa đơn", "VN_IDA.TK_IV3"],
    // 1.44: ô 1 mã phân loại giá (TK_IP1), ô 2 điều kiện giá (TK_IP2), ô 3 mã đồng tiền (TK_IP3), ô 4 tổng trị giá (TK_IP4).
    ["1.44", "Tổng trị giá hóa đơn", "VN_IDA.TK_IP4"],
    ["1.47", "Phí vận chuyển", "VN_IDA_KTG.KTG_FR3"],
    ["1.48", "Phí bảo hiểm", "VN_IDA_KTG.KTG_IN3"],
    ["1.74", "Mã số hàng hóa", "VN_IDA_HANG.HAG_CMD"],
    ["1.76", "Thuế suất", "VN_IDA_HANG.HAG_TXA"],
    ["1.78", "Mô tả hàng hóa", "VN_IDA_HANG.HAG_CMN"],
    ["1.79", "Mã nước xuất xứ", "VN_IDA_HANG.HAG_OR"],
    ["1.80", "Mã Biểu thuế nhập khẩu", "VN_IDA_HANG.HAG_ORS"],
    ["1.83", "Số lượng (1)", "VN_IDA_HANG.HAG_QN1"], // + mã ĐVT HAG_QT1
    ["1.85", "Trị giá hóa đơn", "VN_IDA_HANG.HAG_BPR"],
    ["1.86", "Đơn giá hóa đơn", "VN_IDA_HANG.HAG_UPR"],
  ])("%s %s → %s", (no, label, fptField) => {
    expect(byNo(CATALOG_IDA, no)).toMatchObject({ label, fptField });
  });

  it("1.44 gom mã phân loại giá, điều kiện giá, mã đồng tiền, tổng trị giá", () => {
    const note = byNo(CATALOG_IDA, "1.44").legalNote ?? "";
    for (const part of ["TK_IP1", "TK_IP2", "TK_IP3", "TK_IP4", "DPU"]) expect(note).toContain(part);
  });
  it("Tờ khai không có chỉ tiêu tỷ giá riêng (hệ thống tự áp tỷ giá)", () => {
    expect(CATALOG_IDA.some((x) => /tỷ giá/i.test(x.label))).toBe(false);
  });
  it("TT121/2025 sửa đúng các chỉ tiêu Mẫu 01", () => {
    expect(CATALOG_IDA.filter((x) => x.amendedBy121).map((x) => x.no)).toEqual(
      ["1.12", "1.13", "1.19", "1.20", "1.24", "1.38", "1.44", "1.50", "1.68", "1.69", "1.74", "1.78", "1.80"],
    );
  });
});

describe("Chỉ tiêu then chốt Mẫu 02 (xuất khẩu)", () => {
  it.each([
    ["2.4", "Mã loại hình", "VN_EDA.TK_ECB"],
    ["2.6", "Mã hiệu phương thức vận chuyển", "VN_EDA.TK_MTC"],
    ["2.8", "Cơ quan Hải quan", "VN_EDA.TK_CH"],
    ["2.11", "Mã người xuất khẩu", "VN_EDA.TK_EPC"],
    ["2.12", "Tên người xuất khẩu", "VN_EDA.TK_EPN"],
    ["2.18", "Mã người nhập khẩu", "VN_EDA.TK_CGC"],
    ["2.24", "Số vận đơn (Số B/L, số AWB v.v....)", "VN_EDA.TK_EKN"],
    ["2.25", "Số lượng", "VN_EDA.TK_NO"],
    ["2.26", "Tổng trọng lượng hàng (Gross)", "VN_EDA.TK_GW"],
    ["2.27", "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", "VN_EDA.TK_ST"],
    ["2.28", "Địa điểm nhận hàng cuối cùng", "VN_EDA.TK_DSC"], // tương ứng "địa điểm dỡ hàng" ở nước NK
    ["2.29", "Địa điểm xếp hàng", "VN_EDA.TK_PSC"],
    ["2.30", "Phương tiện vận chuyển dự kiến", "VN_EDA.TK_VSC"],
    ["2.31", "Ngày hàng đi dự kiến", "VN_EDA.TK_SYM"],
    ["2.36", "Số hóa đơn", "VN_EDA.TK_IV3"],
    // 2.39: ô 1 điều kiện giá (TK_IP2), ô 2 mã đồng tiền (TK_IP3), ô 3 tổng trị giá (TK_IP4), ô 4 mã phân loại giá (TK_IP1).
    ["2.39", "Trị giá hóa đơn", "VN_EDA.TK_IP4"],
    ["2.65", "Mã số hàng hóa", "VN_EDA_HANG.HAG_CMD"],
    ["2.67", "Thuế suất", "VN_EDA_HANG.HAG_TXA"],
    ["2.69", "Mô tả hàng hóa", "VN_EDA_HANG.HAG_CMN"], // xuất xứ khai trong mô tả: mô tả#&mã nước
    ["2.72", "Số lượng (1)", "VN_EDA_HANG.HAG_QN1"],
    ["2.74", "Trị giá hóa đơn", "VN_EDA_HANG.HAG_BPR"],
    ["2.75", "Đơn giá hóa đơn", "VN_EDA_HANG.HAG_UPR"],
    ["2.80", "Mã văn bản pháp luật khác", "VN_EDA_HANG.HAG_OL1"],
  ])("%s %s → %s", (no, label, fptField) => {
    expect(byNo(CATALOG_EDA, no)).toMatchObject({ label, fptField });
  });

  it("TT121/2025 sửa đúng các chỉ tiêu Mẫu 02", () => {
    expect(CATALOG_EDA.filter((x) => x.amendedBy121).map((x) => x.no)).toEqual(
      ["2.11", "2.12", "2.18", "2.19", "2.33", "2.57", "2.58", "2.65", "2.67", "2.69"],
    );
  });
});

describe("code-tables", () => {
  it.each([
    ["TRANSPORT_MODES", TRANSPORT_MODES], ["INVOICE_KINDS", INVOICE_KINDS], ["PRICE_KINDS", PRICE_KINDS],
    ["PAYMENT_METHODS", PAYMENT_METHODS], ["INCOTERMS", INCOTERMS], ["UNITS", UNITS], ["PACKAGE_UNITS", PACKAGE_UNITS],
    ["COUNTRIES", COUNTRIES], ["CURRENCIES", CURRENCIES], ["CUSTOMS_OFFICES", CUSTOMS_OFFICES],
    ["TYPE_CODES_NK", TYPE_CODES_NK], ["TYPE_CODES_XK", TYPE_CODES_XK],
  ])("%s không rỗng, mã không trùng, nhãn không rỗng", (_name, table) => {
    expect(table.length).toBeGreaterThan(0);
    expect(new Set(table.map((x) => x.code)).size).toBe(table.length);
    for (const entry of table) expect(entry.label.trim()).not.toBe("");
  });
  it("mã theo Phụ lục II", () => {
    expect(TRANSPORT_MODES.map((x) => x.code)).toEqual(["1", "2", "3", "4", "5", "6", "9"]);
    expect(INVOICE_KINDS.map((x) => x.code)).toEqual(["A", "B", "D"]);
    expect(PRICE_KINDS.map((x) => x.code)).toEqual(["A", "B", "C", "D"]);
    expect(INCOTERMS).toHaveLength(19); // 11 Incoterms 2020 + C&F, CNF, C&I, DAT, DAF, DDU, DES, DEQ
    expect(COUNTRIES.every((x) => /^[A-Z]{2}$/.test(x.code))).toBe(true);
    expect(CURRENCIES.every((x) => /^[A-Z]{3}$/.test(x.code))).toBe(true);
    expect(CUSTOMS_OFFICES.every((x) => /^[0-9]{2}[A-Z0-9]{2}$/.test(x.code))).toBe(true);
  });
});
