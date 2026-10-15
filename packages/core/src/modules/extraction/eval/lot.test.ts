import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { compareValue, guessKindFromSheet, parseExpectedWorkbook, scoreDocument } from "./lot.js";

async function workbook(sheets: Record<string, (string | number | Date | null)[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    ws.addRow(["STT", "TÊN TRƯỜNG", "TRỊ GIÁ"]);
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("guessKindFromSheet", () => {
  it.each([
    ["FANS25040166-HBL-COPY", "BILL_OF_LADING"], ["ARRIVAL NOTICE", "ARRIVAL_NOTICE"], ["thông báo hàng đến YZS24120950", "ARRIVAL_NOTICE"], ["Invoice_CIKA25041701", "INVOICE"],
    ["COMMERCIAL INVOICE", "INVOICE"], ["CO E253984866440001", "CERT_OF_ORIGIN"], ["CO FORM E", "CERT_OF_ORIGIN"], ["hóa đơn cước 1C25TSN_00001808", "FREIGHT_INVOICE"], ["HAWB YZS24120950", "AIR_WAYBILL"],
  ] as const)("%s → %s", (name, kind) => expect(guessKindFromSheet(name)).toBe(kind));
});

describe("parseExpectedWorkbook", () => {
  it("đọc STT | tên trường | trị giá, khớp nhãn theo danh mục; dòng không khớp → cảnh báo, không ném", async () => {
    const buf = await workbook({ "ARRIVAL NOTICE": [[1, "Tàu (Vessel)", "INTERASIA VISION / S079"], [2, "Ngày đến (ETA)", new Date("2025-04-25T00:00:00Z")], [3, "Không có trong danh mục", "x"]] });
    const r = await parseExpectedWorkbook(buf);
    expect(r.sheets[0]).toMatchObject({ sheetName: "ARRIVAL NOTICE", kind: "ARRIVAL_NOTICE" });
    expect(r.sheets[0]!.rows.map((x) => [x.label, x.key])).toEqual([["Tàu (Vessel)", "vessel"], ["Ngày đến (ETA)", "eta"], ["Không có trong danh mục", null]]);
    expect(r.sheets[0]!.rows[1]!.value).toBe("2025-04-25");
    expect(r.warnings).toEqual(['ARRIVAL NOTICE: không khớp trường cho "Không có trong danh mục"']);
  });
  it("mapping.json ghi đè: nhãn trống → trường chỉ định", async () => {
    const buf = await workbook({ Invoice_X: [[5, "", "Made In China"]] });
    const r = await parseExpectedWorkbook(buf, { INVOICE: { "": "originStatement" } });
    expect(r.sheets[0]!.rows[0]).toMatchObject({ key: "originStatement", item: false });
    expect(r.warnings).toEqual([]);
  });
});

describe("compareValue", () => {
  it("chữ: bỏ hoa/thường, dấu câu, xuống dòng; party so độ phủ từ", () => {
    expect(compareValue("Bill No", "FANS25040166", ["FANS25040166"], "code")).toBe(true);
    expect(compareValue("Shipper", "SHENZHEN APTUS TECHNOLOGY CO., LTD\n304/ C BUILDING, HENG MINGZHU", [{ name: "SHENZHEN APTUS TECHNOLOGY CO., LTD", address: "304/ C BUILDING, HENG MINGZHU INDUSTRIAL PARK" }], "party")).toBe(true);
    expect(compareValue("Shipper", "ACME LTD", [{ name: "OTHER CO", address: null }], "party")).toBe(false);
  });
  it("số: kiểu VN 6.247.699, đơn vị kèm theo (119.5 KGS, 1 Pallet), 119.500 KGS (3 số lẻ)", () => {
    expect(compareValue("Thành tiền", "6.247.699", [6247699], "number")).toBe(true);
    expect(compareValue("Gross weight", "119.5 KGS", [119.5], "number")).toBe(true);
    expect(compareValue("KHỐI LƯỢNG", "119.500 KGS", [119.5], "number")).toBe(true);
    expect(compareValue("Number and kind", "1 Pallet", [1], "number")).toBe(true);
    expect(compareValue("Gross weight", "462", [460], "number")).toBe(false);
  });
  it("ngày nhiều dạng; trường gộp (tàu + chuyến, nơi + ngày phát hành)", () => {
    expect(compareValue("Date", " 28/11/2024", ["2024-11-28"], "date")).toBe(true);
    expect(compareValue("Ocean Vessel", "INTERASIA VISION/S079", ["INTERASIA VISION", "S079"], "text")).toBe(true);
    expect(compareValue("Place and date of issue", "SHENZHEN , CHINA  - APR.22.2025", ["SHENZHEN, CHINA", "2025-04-22"], "text")).toBe(true);
    expect(compareValue("Price basis", "EX-Works Shenzhen", ["EXW", "Shenzhen"], "code")).toBe(true);
  });
  it("mã định danh: bỏ dấu gạch/khoảng trắng khi so (MAWB 921-47391621 = 92147391621); khác chữ số vẫn là lệch", () => {
    expect(compareValue("MAWB", "92147391621", ["921-47391621"], "code")).toBe(true);
    expect(compareValue("Reference No.", "2241416230537190", ["02241416230537193"], "code")).toBe(false);
  });
  it("boolean: ô có nội dung (chữ ký, con dấu) ↔ true", () => {
    expect(compareValue("12. Certification", "chữ ký, con dấu", [true], "boolean")).toBe(true);
    expect(compareValue("12. Certification", "chữ ký, con dấu", [false], "boolean")).toBe(false);
  });
});

describe("scoreDocument", () => {
  it("chấm theo dòng khớp được; dòng hàng so với dòng đầu tiên; trả danh sách lệch", () => {
    const res = scoreDocument("INVOICE", [
      { label: "Inv. No", key: "invoiceNo", item: false, value: "CIKA25041701" },
      { label: "QUANTITY", key: "quantity", item: true, value: "60" },
      { label: "PART NO", key: "partNo", item: true, value: "APSX116D" },
    ], { invoiceNo: "CIKA25041701", items: [{ quantity: 60, partNo: null }] });
    expect(res).toMatchObject({ total: 3, matched: 2 });
    expect(res.misses).toEqual([{ label: "PART NO", key: "partNo", expected: "APSX116D", actual: "" }]);
  });
});
