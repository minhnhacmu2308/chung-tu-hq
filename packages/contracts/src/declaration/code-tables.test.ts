import { describe, expect, it } from "vitest";
import { CATALOG_EDA } from "./catalog-eda.js";
import { CATALOG_IDA } from "./catalog-ida.js";
import { CodeTableSchema, type DeclarationFieldDef } from "./catalog-types.js";
import {
  ADJUSTMENT_CODES, ADJUSTMENT_KINDS, BP_REASONS, CARGO_CLASSES, CODE_TABLES, DUE_DATE_CODES, FREIGHT_CLASSES, INCOTERMS,
  INCOTERMS_EDA, INCOTERMS_FREIGHT_NOT_INCLUDED, INCOTERMS_IDA, INCOTERMS_WITH_INSURANCE, INSURANCE_CLASSES,
  MACHINERY_CONDITION_CODES, PACKAGE_UNITS, PARTY_CLASSES, TAX_PAYERS, TAX_TABLES, VALUATION_METHODS,
  VNACCS_SYNCED_CODE_TABLES, codeTableEntries, isIncotermAllowed,
} from "./code-tables.js";

const ALL = [...CATALOG_IDA, ...CATALOG_EDA];
const byNo = (no: string): DeclarationFieldDef => {
  const field = ALL.find((x) => x.no === no);
  if (!field) throw new Error(`Không có chỉ tiêu ${no}`);
  return field;
};
const codes = (table: readonly { code: string }[]) => table.map((x) => x.code);

describe("tra bảng mã theo tên (CODE_TABLES)", () => {
  it("mọi codeTable mà chỉ tiêu tham chiếu đều ra bảng không rỗng hoặc là bảng phải đồng bộ VNACCS", () => {
    for (const field of ALL) {
      if (!field.codeTable) continue;
      const entries = codeTableEntries(field.codeTable);
      if (VNACCS_SYNCED_CODE_TABLES.includes(field.codeTable)) expect(entries, field.no).toBeUndefined();
      else expect(entries?.length ?? 0, `${field.no} → ${field.codeTable}`).toBeGreaterThan(0);
    }
  });
  it("mỗi tên bảng trong CodeTableSchema thuộc đúng một nhóm: có dữ liệu hoặc đồng bộ VNACCS", () => {
    for (const name of CodeTableSchema.options) {
      const has = (CODE_TABLES[name]?.length ?? 0) > 0;
      expect(has !== VNACCS_SYNCED_CODE_TABLES.includes(name), name).toBe(true);
    }
  });
  it("PACKAGE_KIND trỏ tới PACKAGE_UNITS; 1.27 / 2.25 dùng mã loại kiện, không dùng UNIT", () => {
    expect(CODE_TABLES.PACKAGE_KIND).toBe(PACKAGE_UNITS);
    expect(byNo("1.27").codeTable).toBe("PACKAGE_KIND");
    expect(byNo("2.25").codeTable).toBe("PACKAGE_KIND");
    expect(PACKAGE_UNITS.find((x) => x.code === "PK")?.unverified).toBe(true);
  });
  it("chỉ tiêu có bảng mã mới gắn đúng bảng", () => {
    expect([byNo("1.5").codeTable, byNo("2.5").codeTable]).toEqual(["CARGO_CLASS", "CARGO_CLASS"]);
    expect(byNo("1.7").codeTable).toBe("PARTY_CLASS");
    expect(byNo("1.45").codeTable).toBe("VALUATION_METHOD");
    expect(byNo("1.47").codeTable).toBe("FREIGHT_CLASS");
    expect(byNo("1.48").codeTable).toBe("INSURANCE_CLASS");
    expect(byNo("1.49").codeTable).toBe("ADJUSTMENT_CODE");
    expect([byNo("1.52").codeTable, byNo("2.43").codeTable]).toEqual(["TAX_PAYER", "TAX_PAYER"]);
    expect(byNo("1.53").codeTable).toBe("BP_REASON");
    expect([byNo("1.58").codeTable, byNo("2.48").codeTable]).toEqual(["DUE_DATE", "DUE_DATE"]);
  });
});

describe("legalNote", () => {
  it.each(ALL.map((f) => [f.no, f] as const))("%s ≤ 300 ký tự", (_no, field) => {
    expect((field.legalNote ?? "").length).toBeLessThanOrEqual(300);
  });
});

describe("cờ bắt buộc theo Phụ lục II", () => {
  it.each(["1.23", "1.26", "1.29", "1.42", "1.43", "1.52", "2.26", "2.27", "2.31", "2.34"])("%s là M", (no) => {
    expect(byNo(no).required).toBe("M");
  });
  it("chỉ thị Hải quan 1.70–1.73 / 2.61–2.64 ánh xạ VN_*_CTHQ", () => {
    expect(["1.70", "1.71", "1.72", "1.73"].map((no) => byNo(no).fptField)).toEqual(
      ["VN_IDA_CTHQ.CTHQ_CCM", "VN_IDA_CTHQ.CTHQ_D01", "VN_IDA_CTHQ.CTHQ_T01", "VN_IDA_CTHQ.CTHQ_I01"],
    );
    expect(["2.61", "2.62", "2.63", "2.64"].map((no) => byNo(no).fptField)).toEqual(
      ["VN_EDA_CTHQ.CTHQ_CCM", "VN_EDA_CTHQ.CTHQ_D01", "VN_EDA_CTHQ.CTHQ_T01", "VN_EDA_CTHQ.CTHQ_I01"],
    );
  });
});

describe("điều kiện giá theo mẫu tờ khai", () => {
  const all = codes(INCOTERMS);
  it("IDA 18 mã có DPU (TT121), EDA 17 mã không có DPU (TT39 2.39), đều thuộc INCOTERMS", () => {
    expect(INCOTERMS_IDA).toHaveLength(18);
    expect(INCOTERMS_EDA).toHaveLength(17);
    expect(INCOTERMS_IDA).toContain("DPU");
    expect(INCOTERMS_EDA).not.toContain("DPU");
    for (const code of [...INCOTERMS_IDA, ...INCOTERMS_EDA]) expect(all).toContain(code);
  });
  it("CNF được chấp nhận như C&F; DPU chỉ cho Mẫu 01", () => {
    expect(isIncotermAllowed("CNF", "01")).toBe(true);
    expect(isIncotermAllowed("CNF", "02")).toBe(true);
    expect(isIncotermAllowed("DPU", "01")).toBe(true);
    expect(isIncotermAllowed("DPU", "02")).toBe(false);
    expect(isIncotermAllowed("FOB BUSAN", "01")).toBe(false);
  });
  it("danh sách đã gồm bảo hiểm theo 1.48 TT39, nhóm E/F chưa gồm cước", () => {
    expect([...INCOTERMS_WITH_INSURANCE].sort()).toEqual(["C&I", "CIF", "CIP", "DAF", "DAP", "DAT", "DDP", "DDU"]);
    expect(INCOTERMS_FREIGHT_NOT_INCLUDED).toEqual(["EXW", "FCA", "FAS", "FOB"]);
    for (const code of [...INCOTERMS_WITH_INSURANCE, ...INCOTERMS_FREIGHT_NOT_INCLUDED]) expect(all).toContain(code);
  });
});

describe("bảng mã ghi trong Phụ lục II", () => {
  it.each([
    ["CARGO_CLASSES", CARGO_CLASSES], ["PARTY_CLASSES", PARTY_CLASSES], ["VALUATION_METHODS", VALUATION_METHODS],
    ["FREIGHT_CLASSES", FREIGHT_CLASSES], ["INSURANCE_CLASSES", INSURANCE_CLASSES], ["ADJUSTMENT_CODES", ADJUSTMENT_CODES],
    ["ADJUSTMENT_KINDS", ADJUSTMENT_KINDS], ["TAX_PAYERS", TAX_PAYERS], ["BP_REASONS", BP_REASONS],
    ["DUE_DATE_CODES", DUE_DATE_CODES], ["TAX_TABLES", TAX_TABLES], ["MACHINERY_CONDITION_CODES", MACHINERY_CONDITION_CODES],
  ])("%s không rỗng, mã không trùng, nhãn không rỗng, đều đã đối chiếu văn bản", (_name, table) => {
    expect(table.length).toBeGreaterThan(0);
    expect(new Set(codes(table)).size).toBe(table.length);
    for (const entry of table) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.unverified).toBeUndefined();
    }
  });
  it("mã đúng văn bản", () => {
    expect(codes(CARGO_CLASSES)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
    expect(codes(VALUATION_METHODS)).toEqual(["1", "2", "3", "4", "6", "7", "8", "9", "T"]);
    expect(codes(FREIGHT_CLASSES)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(codes(INSURANCE_CLASSES)).toEqual(["A", "D"]);
    expect(codes(ADJUSTMENT_KINDS)).toEqual(["AD", "SB", "IP", "DP"]);
    expect(codes(TAX_PAYERS)).toEqual(["1", "2"]);
    expect(codes(DUE_DATE_CODES)).toEqual(["A", "B", "C", "D"]);
  });
  it("khoản điều chỉnh: cộng (AD) / trừ (SB) theo 1.49", () => {
    const of = (kind: "AD" | "SB") => ADJUSTMENT_CODES.filter((x) => x.kind === kind).map((x) => x.code);
    expect(of("AD")).toEqual(["A", "B", "C", "D", "E", "P", "Q", "K", "M"]);
    expect(of("SB")).toEqual(["U", "V", "H", "T", "G", "S", "L"]);
    expect(ADJUSTMENT_CODES.find((x) => x.code === "N")?.kind).toBeUndefined();
  });
  it("mã biểu thuế: B17 là Chương 98, B06 AKFTA, không có mã FTA ngoài văn bản (EVFTA, CPTPP, RCEP…)", () => {
    expect(TAX_TABLES).toHaveLength(18);
    expect(TAX_TABLES.find((x) => x.code === "B17")?.label).toContain("Chương 98");
    expect(TAX_TABLES.find((x) => x.code === "B06")?.label).toContain("AKFTA");
    expect(TAX_TABLES.some((x) => /EVFTA|CPTPP|RCEP|UKVFTA|VKFTA/.test(x.label))).toBe(false);
  });
});
