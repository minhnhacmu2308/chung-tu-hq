import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { chunks, normalizeHeader, parseCatalogWorkbook } from "./import-xlsx";

const HEADERS = ["Mã đơn vị", "Số TK", "Ngày ĐK", "Mã loại hình", "STT dòng hàng", "Mã hàng", "Mã HS", "Tên hàng", "Số lượng 1", "ĐVT SL1", "Xuất xứ", "Biểu thuế nhập khẩu", "Thuế suất NK(%)", "Thuế suất VAT(%)", "Ghi Chú"];

async function book(rows: (string | number | null)[][], opts: { title?: boolean; headers?: string[] } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  if (opts.title) ws.addRow(["BẢNG KÊ DÒNG HÀNG ĐÃ KHAI"]);
  ws.addRow(opts.headers ?? HEADERS);
  for (const r of rows) ws.addRow(r);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
const YSL = "Nước hoa hiệu YSL (YSL Libre Wf EDP 90ml), 145612. Hàng mới 100%";

describe("đọc bảng kê dòng hàng (Excel) → mặt hàng", () => {
  it("nhận cột theo tên (bỏ dấu); gộp theo mã hàng (lấy từ cuối tên khi cột trống); lấy tờ khai mới nhất; đếm số tờ khai", async () => {
    const parsed = await parseCatalogWorkbook(await book([
      ["0102325399", "108091566221", "27/03/2026", "A44", "01", "", "33030000", YSL, 50, "UNA", "FR", "B01", "18%", "", "#&ANNEXURE AE"],
      ["0102325399", "108091566221", "27/03/2026", "A44", "02", "", "33030000", YSL, 10, "UNA", "FR", "B01", "18%", "", "#&ANNEXURE AE"],
      ["0102325399", "108253855031", "19/05/2026", "H11", "01", "", "33030000", "Nước hoa hiệu YSL (YSL Libre Wf EDP 90ml), 145612. Mới 100%", 5, "UNA", "fr", "B01", "18%", "8%", ""],
      ["0102325399", "108253855031", "19/05/2026", "A44", "02", "", 22083090, "Rượu JACK DANIELS 1L, nồng độ cồn 40%. Hàng mới 100%", 48, "UNA", "US", "B01", "45%", "", ""],
    ], { title: true }));
    expect(parsed).toMatchObject({ rows: 4, issues: [], conflicts: [], missingColumns: [] });
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      code: "145612", hsCode: "33030000", unit: "UNA", origin: "FR", tariffSchedule: "B01", importDutyRate: "18", vatRate: "8",
      timesDeclared: 2, lastDeclarationNo: "108253855031", lastDeclarationDate: "2026-05-19", lastTypeCode: "H11",
    });
    expect(parsed.items[0]!.raw).toMatchObject({ "Số TK": "108253855031", "Ghi Chú": "" });
    expect(parsed.items[1]).toMatchObject({ code: null, hsCode: "22083090", importDutyRate: "45", timesDeclared: 1 });
  });

  it("dòng thiếu tên / HS sai → bỏ qua và báo số dòng; cùng mặt hàng nhiều mã HS → báo xung đột; HS mất số 0 đầu → bù", async () => {
    const parsed = await parseCatalogWorkbook(await book([
      ["x", "1", "01/01/2026", "A11", "01", "SKU1", "33030000", "Hàng A", 1, "PCE", "CN", "", "", "", ""],
      ["x", "2", "02/01/2026", "A11", "01", "SKU1", "33049930", "Hàng A", 1, "PCE", "CN", "", "", "", ""],
      ["x", "3", "02/01/2026", "A11", "01", "", "3303", "Hàng B", 1, "PCE", "CN", "", "", "", ""],
      ["x", "4", "02/01/2026", "A11", "01", "", "33030000", "", 1, "PCE", "CN", "", "", "", ""],
      ["x", "5", "02/01/2026", "A11", "01", "", 9011100, "Cà phê", 1, "KGM", "BR", "", "", "", ""],
    ]));
    expect(parsed.issues).toEqual([{ row: 4, reason: "invalidHs" }, { row: 5, reason: "missingName" }]);
    expect(parsed.conflicts).toEqual([{ name: "Hàng A", hsCodes: ["33030000", "33049930"] }]);
    expect(parsed.items.find((i) => i.code === "SKU1")).toMatchObject({ hsCode: "33049930", timesDeclared: 2 });
    expect(parsed.items.find((i) => i.name === "Cà phê")?.hsCode).toBe("09011100");
  });

  it("thiếu cột bắt buộc → báo cột thiếu, không đọc", async () => {
    const parsed = await parseCatalogWorkbook(await book([["a", "b"]], { headers: ["Số TK", "Tên hàng"] }));
    expect(parsed).toMatchObject({ items: [], missingColumns: ["hsCode"] });
  });

  it("chuẩn hóa tiêu đề và chia lô", () => {
    expect(normalizeHeader("Thuế suất NK(%)")).toBe("thue suat nk");
    expect(normalizeHeader("ĐVT SL1")).toBe("dvt sl1");
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
