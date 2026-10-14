import { describe, expect, it } from "vitest";
import { countryCode, nameSimilarity, normalizeCompanyName, packageUnitCode, parseDate, parseNumber, unitCode } from "../normalize.js";

describe("parseNumber", () => {
  it.each([
    ["1,234.56", "1234.56"],
    ["1.234,56", "1234.56"],
    ["20,850.00", "20850.00"],
    ["3.860,50", "3860.50"],
    ["20850", "20850"],
    ["USD 1,150.00", "1150.00"],
    ["1 234,5", "1234.5"],
    ["0.5", "0.5"],
    ["-12.00", "-12.00"],
    [3860.5, "3860.5"],
    ["1,234", "1234"],
    ["12,5", "12.5"],
  ])("%s → %s", (raw, out) => expect(parseNumber(raw)).toBe(out));
  it("không phải số → null", () => {
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-10-02", "2026-10-02"],
    ["02/10/2026", "2026-10-02"],
    ["02.10.2026", "2026-10-02"],
    ["02-10-2026", "2026-10-02"],
    ["2026/10/02", "2026-10-02"],
    ["02 Oct 2026", "2026-10-02"],
    ["Oct 2, 2026", "2026-10-02"],
    ["October 02, 2026", "2026-10-02"],
    ["2 tháng 10 năm 2026", "2026-10-02"],
    ["20261002", "2026-10-02"],
  ])("%s → %s", (raw, out) => expect(parseDate(raw)).toBe(out));
  it("gợi ý MDY đổi cách hiểu 02/10/2026 → 10 tháng 2", () => expect(parseDate("02/10/2026", "MDY")).toBe("2026-02-10"));
  it("ngày không tồn tại hoặc rác → null", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("n/a")).toBeNull();
  });
});

describe("countryCode", () => {
  it.each([
    ["KOREA", "KR"], ["South Korea", "KR"], ["REPUBLIC OF KOREA", "KR"], ["China", "CN"], ["P.R. China", "CN"], ["Viet Nam", "VN"], ["Vietnam", "VN"],
    ["Italy", "IT"], ["Japan", "JP"], ["Germany", "DE"], ["USA", "US"], ["United States of America", "US"], ["KR", "KR"], ["kr", "KR"], ["Thailand", "TH"], ["Taiwan", "TW"],
  ])("%s → %s", (raw, out) => expect(countryCode(raw)).toBe(out));
  it("không nhận ra → null", () => expect(countryCode("Narnia")).toBeNull());
});

describe("unitCode", () => {
  it.each([["PCS", "PCE"], ["pcs", "PCE"], ["PIECES", "PCE"], ["EA", "PCE"], ["SET", "SET"], ["SETS", "SET"], ["KG", "KGM"], ["KGS", "KGM"], ["CTN", "CTN"], ["CARTONS", "CTN"], ["PKG", "PK"], ["PACKAGES", "PK"], ["M", "MTR"], ["PAIRS", "PR"], ["ROLL", "ROL"], ["CBM", "MTQ"], ["TONS", "TNE"]])(
    "%s → %s",
    (raw, out) => expect(unitCode(raw)).toBe(out),
  );
  it("không nhận ra → null", () => expect(unitCode("BLAH")).toBeNull());
});

describe("packageUnitCode", () => {
  it.each([["PALLETS", "PL"], ["CTN", "CT"], ["cartons", "CT"], ["PACKAGE", "PK"], ["PKGS", "PK"], ["Boxes", "BX"], ["BAG", "BG"], ["DRUM", "DR"]])("%s → %s", (raw, out) => expect(packageUnitCode(raw)).toBe(out));
  it("lạ → null", () => expect(packageUnitCode("blob")).toBeNull());
});

describe("tên công ty", () => {
  it("normalizeCompanyName bỏ hậu tố pháp lý, dấu câu, chữ hoa", () => {
    expect(normalizeCompanyName("Hansol Precision Co., Ltd.")).toBe("HANSOL PRECISION");
    expect(normalizeCompanyName("CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT")).toBe("THIET BI CONG NGHIEP AN PHAT");
  });
  it("nameSimilarity: cùng tên khác hậu tố ≈ 1; tên EN vs tên VN của cùng công ty thấp", () => {
    expect(nameSimilarity("HANSOL PRECISION CO., LTD.", "Hansol Precision Co Ltd")).toBe(1);
    expect(nameSimilarity("AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT")).toBeLessThan(0.5);
    expect(nameSimilarity("ABC", "XYZ")).toBe(0);
  });
});
