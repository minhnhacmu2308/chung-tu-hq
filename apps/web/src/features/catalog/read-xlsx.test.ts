import { ITEM_IMPORT_MAX_LENGTH, validateItemRows } from "@kb/contracts";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { columnLetter, readItemWorkbook, toImportRows } from "./read-xlsx";

async function book(sheets: { name: string; rows: (string | number | null)[][] }[]) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    for (const r of s.rows) ws.addRow(r);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("đọc file Excel danh mục của một bộ phận", () => {
  it("tìm dòng tiêu đề dưới dòng tên báo cáo, nhận cột theo tên thường gặp, giữ số dòng Excel, bỏ dòng trống", async () => {
    const sheet = await readItemWorkbook(
      await book([
        {
          name: "Vật tư",
          rows: [
            ["DANH MỤC VẬT TƯ – KHO"],
            ["STT", "Mã vật tư", "Tên vật tư", "ĐVT", "Mã HS", "Quy đổi"],
            [1, "vt-0012 ", "Vòng bi 6205", "PCE", 84821000, null],
            [null, null, null, null, null, null],
            [2, "VT 0013", "Dây cáp CVV", "ROL", "8544.49.49", "100"],
          ],
        },
      ]),
    );
    expect(sheet).not.toBeNull();
    expect(sheet!.sheetName).toBe("Vật tư");
    expect(sheet!.headers.slice(0, 6)).toEqual(["STT", "Mã vật tư", "Tên vật tư", "ĐVT", "Mã HS", "Quy đổi"]);
    expect(sheet!.detected).toEqual({ code: 1, name: 2, unit: 3, hs: 4, factor: 5 });
    expect(sheet!.rowNumbers).toEqual([3, 5]);
    expect(toImportRows(sheet!, sheet!.detected)).toEqual([
      { code: "vt-0012", name: "Vòng bi 6205", unit: "PCE", hs: "84821000" },
      { code: "VT 0013", name: "Dây cáp CVV", unit: "ROL", hs: "8544.49.49", factor: "100" },
    ]);
  });

  it("mã HS ô SỐ mất số 0 đầu (7 chữ số) → bù lại; ô CHỮ 7 chữ số giữ nguyên → bước kiểm báo sai định dạng; chọn trang tính nhận được nhiều cột nhất", async () => {
    const sheet = await readItemWorkbook(
      await book([
        { name: "Ghi chú", rows: [["Ghi chú"], ["Không phải danh mục"]] },
        { name: "Danh mục", rows: [["Item code", "Description", "HS code"], ["A-1", "Hạt điều", 8013200], ["A-2", "Máy tính", "8471301"]] },
      ]),
    );
    expect(sheet!.sheetName).toBe("Danh mục");
    const rows = toImportRows(sheet!, sheet!.detected);
    expect(rows).toEqual([
      { code: "A-1", name: "Hạt điều", hs: "08013200" },
      { code: "A-2", name: "Máy tính", hs: "8471301" },
    ]);
    expect(validateItemRows(rows).errors).toEqual([{ row: 2, field: "hs", code: "INVALID_FORMAT" }]);
  });

  it("không cắt bớt ô dài: mã hàng quá giới hạn giữ nguyên → bước kiểm báo TOO_LONG", async () => {
    const longCode = "X".repeat(ITEM_IMPORT_MAX_LENGTH.code + 5);
    const sheet = await readItemWorkbook(await book([{ name: "S", rows: [["Mã hàng", "Tên hàng"], [longCode, "Hàng"]] }]));
    const rows = toImportRows(sheet!, sheet!.detected);
    expect(rows[0]!.code).toBe(longCode);
    expect(validateItemRows(rows).errors).toEqual([{ row: 1, field: "code", code: "TOO_LONG" }]);
  });

  it("không nhận được cột nào → vẫn trả tiêu đề (dòng đầu có dữ liệu) để người dùng tự ghép; file trống → null", async () => {
    const sheet = await readItemWorkbook(await book([{ name: "S", rows: [["Cột 1", "Cột 2"], ["X", "Y"]] }]));
    expect(sheet!.detected).toEqual({});
    expect(sheet!.headers).toEqual(["Cột 1", "Cột 2"]);
    expect(toImportRows(sheet!, { code: 0, name: 1 })).toEqual([{ code: "X", name: "Y" }]);
    expect(await readItemWorkbook(await book([{ name: "S", rows: [] }]))).toBeNull();
  });

  it("chữ cái tên cột Excel", () => {
    expect([0, 25, 26, 27, 701].map(columnLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ"]);
  });
});
