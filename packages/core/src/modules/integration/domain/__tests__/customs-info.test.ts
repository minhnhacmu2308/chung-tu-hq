import { describe, expect, it } from "vitest";
import { mergeCustomsInfo, parseCustomsInfo } from "../customs-info.js";

const AT = new Date("2026-10-14T15:01:21.000Z");

// Rút từ phản hồi EDA thật của FPT (apps/fpt-mock/src/fixtures/eda-response-success.json).
const EDA_REAL = {
  objMsgResult: { function: "EDA", code: "VAE0LA0", decNumber: "309062686130" },
  objVN_EDA: {
    tK_ECN: 309062686130, tK_ECB: "B11", tK_K01: "5512", tK_K08: "CCHQTN", tK_CHB: "00", tK_FCD: "USD", tK_FKK: 5543.17,
    tK_RC1: "USD", tK_RD1: 25720, tK_RC2: null, tK_RD2: null, tK_K69: "3", tK_K70: "1", tK_K10: null, tK_ETA: null,
  },
  objVN_EDA_TRANGTHAI: { tK_LUONG: "0", tK_TRANGTHAI: "A", tK_THONGQUAN: "0" },
  objVN_EDA_CTHQ: { cthQ_CCM: null, cthQ_D01: null, cthQ_T01: null, cthQ_I01: null },
  objVN_EDA_HANG: [{ haG_R01: "01", haG_CMD: "55121900", haG_R07: 142570332.4, haG_BPC: "VND", haG_TAX: null }],
};

describe("parseCustomsInfo", () => {
  it("EDA thật sau khai tạm: số tờ khai, HS đại diện, Chi cục, tỷ giá, trị giá tính thuế, số trang/dòng, trị giá từng dòng", () => {
    const info = parseCustomsInfo("EDA", EDA_REAL, AT);
    expect(info).toEqual({
      receivedAt: "2026-10-14T15:01:21.000Z",
      declarationNo: "309062686130",
      customsOfficeName: "CCHQTN",
      subsection: "00",
      representativeHs: "5512",
      pages: 3,
      lines: 1,
      exchangeRates: [{ currency: "USD", rate: "25720" }],
      totalCustomsValue: { amount: "5543.17", currency: "USD" },
      taxes: [],
      items: [{ lineNo: 1, hsCode: "55121900", customsValue: "142570332.4", customsValueCurrency: "VND" }],
      directives: [],
    });
  });

  it("IDA: ngày giờ đăng ký, mã phân loại kiểm tra, thuế theo sắc thuế, tổng thuế, bảo lãnh, tỷ giá", () => {
    const info = parseCustomsInfo("IDA", {
      objVN_IDA: { tK_ICN: 105123456780, tK_A09: "20/10/2026", tK_AD11: "093015", tK_A06: "1", tK_A07: "CCHQHPKVIII", tK_A86: 597864878, tK_BNO: 1, tK_DNO: 2 },
      objVN_IDA_THUE: {
        thuE_KF1: "N", thuE_KG1: "Thuế NK", thuE_KH1: 0, thuE_KF2: "V", thuE_KG2: "Thuế GTGT", thuE_KH2: "59786488",
        thuE_KF3: null, thuE_KG3: null, thuE_KH3: null, thuE_B02: 59786488, thuE_B03: 0, thuE_KJ1: "USD", thuE_KK1: 26150,
      },
      objVN_IDA_HANG: [{ haG_B25: 1, haG_CMD: "85015119", haG_B36: 597864878, haG_B50: "VND", haG_B43: 0, haG_B47: 0 }],
      objVN_IDA_TRANGTHAI: { tK_C21: "21/10/2026", tK_AD4: "101500", tK_C20: "Nguyễn Văn A" },
    }, AT);
    expect(info).toMatchObject({
      declarationNo: "105123456780",
      branch: { no: 1, of: 2 },
      registeredDate: "2026-10-20",
      registeredTime: "09:30:15",
      inspectionCode: "1",
      customsOfficeName: "CCHQHPKVIII",
      totalCustomsValue: { amount: "597864878", currency: "VND" },
      taxes: [{ code: "N", name: "Thuế NK", amountVnd: "0" }, { code: "V", name: "Thuế GTGT", amountVnd: "59786488" }],
      totalTaxVnd: "59786488",
      guaranteeVnd: "0",
      exchangeRates: [{ currency: "USD", rate: "26150" }],
      items: [{ lineNo: 1, hsCode: "85015119", customsValue: "597864878", customsValueCurrency: "VND", taxRate: "0", taxAmountVnd: "0" }],
      permitDate: "2026-10-21",
      permitTime: "10:15:00",
      chiefName: "Nguyễn Văn A",
    });
  });

  it("chỉ thị Hải quan: lấy các lần có nội dung, theo thứ tự", () => {
    const info = parseCustomsInfo("IDA", {
      objVN_IDA_CTHQ: { cthQ_CCM: "A", cthQ_D01: "20/10/2026", cthQ_T01: "Bổ sung C/O", cthQ_I01: "Nộp bản chính C/O form E", cthQ_D02: null, cthQ_I02: "", cthQ_T03: "Sửa trị giá", cthQ_I03: "Khai lại 1.50" },
    }, AT);
    expect(info.directiveKind).toBe("A");
    expect(info.directives).toEqual([
      { date: "2026-10-20", title: "Bổ sung C/O", content: "Nộp bản chính C/O form E" },
      { title: "Sửa trị giá", content: "Khai lại 1.50" },
    ]);
  });

  it("EDA: thuế xuất khẩu và lệ phí cộng thành tổng thuế", () => {
    const info = parseCustomsInfo("EDA", { objVN_EDA: { tK_ETA: "1500000", tK_TCO: 20000, tK_K10: "15/10/2026", tK_RT1: "080000", tK_K07: "2" } }, AT);
    expect(info).toMatchObject({
      taxes: [{ name: "Thuế xuất khẩu", amountVnd: "1500000" }, { name: "Lệ phí hải quan", amountVnd: "20000" }],
      totalTaxVnd: "1520000", registeredDate: "2026-10-15", registeredTime: "08:00:00", inspectionCode: "2",
    });
  });

  it("phần tử trống → chỉ có thời điểm nhận và các danh sách rỗng", () => {
    expect(parseCustomsInfo("IDA", {}, AT)).toEqual({ receivedAt: AT.toISOString(), exchangeRates: [], taxes: [], items: [], directives: [] });
  });
});

describe("mergeCustomsInfo", () => {
  it("phản hồi sau rút gọn không xóa dữ liệu đã có; giá trị mới ghi đè", () => {
    const first = parseCustomsInfo("EDA", EDA_REAL, AT);
    const later = parseCustomsInfo("EDA", { objVN_EDA: { tK_ECN: 309062686130, tK_K10: "15/10/2026" }, objVN_EDA_TRANGTHAI: { tK_K86: "16/10/2026" } }, new Date("2026-10-16T01:00:00Z"));
    const merged = mergeCustomsInfo(first, later);
    expect(merged).toMatchObject({ representativeHs: "5512", registeredDate: "2026-10-15", permitDate: "2026-10-16", receivedAt: "2026-10-16T01:00:00.000Z" });
    expect(merged.items).toHaveLength(1);
    expect(merged.exchangeRates).toEqual([{ currency: "USD", rate: "25720" }]);
  });
  it("chưa có dữ liệu trước → trả bản mới", () => {
    const next = parseCustomsInfo("IDA", {}, AT);
    expect(mergeCustomsInfo(null, next)).toBe(next);
  });
});
