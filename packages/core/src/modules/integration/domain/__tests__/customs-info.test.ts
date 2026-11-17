import { describe, expect, it } from "vitest";
import { LAYOUT_IDA, layoutFields } from "@kb/contracts";
import { CUSTOMS_PRINT_FIELDS, mergeCustomsInfo, parseCustomsInfo } from "../customs-info.js";

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

  // Số liệu theo bản in VNACCS của tờ khai 108826785430 (mực ống đông lạnh, A11): ô in nguyên văn ngoài các trường có tên riêng.
  it("IDA: ô in nguyên văn – phần chung, vận đơn, sắc thuế, dòng hàng (thuế suất chữ, đơn giá tính thuế, thuế và thu khác)", () => {
    const info = parseCustomsInfo("IDA", {
      objVN_IDA: { tK_ICN: 108826785430, tK_CHB: "00", tK_TP: 36113, tK_A97: null, tK_B08: "A", tK_A07: "CCHQTN" },
      objVN_IDA_VANDON: { vD_ST: "02CIS01", vD_A51: "TONG CTY TAN CANG SG" },
      objVN_IDA_THUE: { thuE_KF1: "N", thuE_KG1: "Thuế NK", thuE_KH1: 138078056, thuE_KI1: 1, thuE_KI2: null },
      objVN_IDA_HANG: [{
        haG_B25: 1, haG_B36: 920520370, haG_B42: "A", haG_B43: "15%", haG_SKB: "M", haG_KKT: "98136.5000", haG_KKS: "VND", haG_B47: 138078055.5, haG_OR: "IN", haG_B56: "INDIA",
        haG_KQ1: "Thuế GTGT", haG_KS1: 1058598425.5, haG_KY1: "0%", haG_KZ1: 0, haG_TX1: "VB901", haG_KQ2: "",
      }],
    }, AT);
    expect(info.subsection).toBe("00");
    expect(info.fields).toEqual({ TK_TP: "36113", TK_B08: "A", VD_A51: "TONG CTY TAN CANG SG", THUE_KI1: "1" });
    expect(info.items[0]).toMatchObject({ lineNo: 1, taxRate: "15", taxAmountVnd: "138078055.5" });
    // Ô người khai nhập (HAG_OR, HAG_TX1) không lấy; ô rỗng bỏ; số chuẩn hóa.
    expect(info.items[0]!.fields).toEqual({
      HAG_B42: "A", HAG_B43: "15%", HAG_SKB: "M", HAG_KKT: "98136.5", HAG_KKS: "VND", HAG_B56: "INDIA",
      HAG_KQ1: "Thuế GTGT", HAG_KS1: "1058598425.5", HAG_KY1: "0%", HAG_KZ1: "0",
    });
  });
  it("thuế suất chữ → % số: '15%', '5 %', '7,5' đọc được; mức tuyệt đối → không có taxRate (vẫn in nguyên văn)", () => {
    const rate = (v: unknown) => parseCustomsInfo("IDA", { objVN_IDA_HANG: [{ haG_B25: 1, haG_B43: v }] }, AT).items[0];
    expect(rate("15%")?.taxRate).toBe("15");
    expect(rate("5 %")?.taxRate).toBe("5");
    expect(rate("7,5")?.taxRate).toBe("7.5");
    expect(rate(0)?.taxRate).toBe("0");
    expect(rate("3000VND/KGM")).toMatchObject({ fields: { HAG_B43: "3000VND/KGM" } });
    expect(rate("3000VND/KGM")?.taxRate).toBeUndefined();
  });
  it("mọi ô in nguyên văn có trên bố cục IDA", () => {
    const keys = new Set(layoutFields(LAYOUT_IDA).map((f) => f.key));
    const all = Object.values(CUSTOMS_PRINT_FIELDS.IDA).flat();
    expect(all.filter((k) => !keys.has(k))).toEqual([]);
  });
  it("EDA không có ô in nguyên văn; phản hồi sau không có ô → giữ ô đã có", () => {
    expect(parseCustomsInfo("EDA", EDA_REAL, AT).fields).toBeUndefined();
    const first = parseCustomsInfo("IDA", { objVN_IDA: { tK_B08: "A" } }, AT);
    expect(mergeCustomsInfo(first, parseCustomsInfo("IDA", { objVN_IDA: { tK_A06: "2" } }, AT)).fields).toEqual({ TK_B08: "A" });
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
  it("chỉ thị nguyên văn (directivesRaw): giữ khoảng trắng, bỏ ô trống; merge giữ bản cũ khi bản mới không có", () => {
    const info = parseCustomsInfo("IDA", { objVN_IDA_CTHQ: { cthQ_ID: 9, cthQ_CCM: "A", cthQ_T01: " Bổ sung  C/O ", cthQ_I01: "Nộp  C/O ", cthQ_I02: "" } }, AT);
    expect(info.directivesRaw).toEqual({ cthQ_CCM: "A", cthQ_T01: " Bổ sung  C/O ", cthQ_I01: "Nộp  C/O " });
    expect(mergeCustomsInfo(info, parseCustomsInfo("IDA", {}, AT)).directivesRaw).toEqual(info.directivesRaw);
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
