import { LAYOUT_EDA, LAYOUT_IDA, layoutFields, type CustomsInfo } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { customsItemValues, customsValues } from "./customs-adapter";

const info: CustomsInfo = {
  receivedAt: "2026-10-16T03:00:00Z",
  declarationNo: "107624410320",
  registeredDate: "2026-10-16",
  registeredTime: "10:12:00",
  customsOfficeName: "CCHQ CK CANG HP KV1",
  inspectionCode: "2",
  representativeHs: "8482",
  pages: 3,
  lines: 2,
  exchangeRates: [{ currency: "USD", rate: "25450" }],
  totalCustomsValue: { amount: "1000000", currency: "VND" },
  taxes: [{ code: "N", name: "Thuế NK", amountVnd: "50000" }, { code: "V", name: "Thuế GTGT", amountVnd: "105000" }],
  totalTaxVnd: "155000",
  items: [{ lineNo: 2, customsValue: "600000", customsValueCurrency: "VND", taxRate: "5", taxAmountVnd: "30000" }, { lineNo: 1, customsValue: "400000", taxRate: "5", taxAmountVnd: "20000" }],
  directiveKind: "A",
  directives: [{ date: "2026-10-16", title: "Kiểm tra hồ sơ", content: "Bổ sung C/O" }],
  permitDate: "2026-10-17",
  permitTime: "08:00:00",
  chiefName: "Nguyễn Văn A",
};

describe("customsValues – thông tin Hải quan trả về → ô tab Hải quan trả về (tên trường VNACCS)", () => {
  it("IDA: số tờ khai, đăng ký, phân luồng, thông quan, sắc thuế, tỷ giá, cấp phép, chỉ thị", () => {
    const v = customsValues("IDA", info, { channel: "YELLOW", clearanceStatus: "CLEARED" });
    expect(v).toMatchObject({
      TK_ICN: "107624410320", TK_A09: "2026-10-16", TK_AD11: "10:12:00", TK_A06: "2", TK_A07: "CCHQ CK CANG HP KV1", TK_A00: "8482", TK_B12: "3", TK_B13: "2",
      TK_LUONG: "2", TK_THONGQUAN: "1",
      THUE_KF1: "N", THUE_KG1: "Thuế NK", THUE_KH1: "50000", THUE_KF2: "V", THUE_B02: "155000", THUE_KJ1: "USD", THUE_KK1: "25450", TK_A86: "1000000",
      TK_C21: "2026-10-17", TK_AD4: "08:00:00", TK_C20: "Nguyễn Văn A",
      CTHQ_CCM: "A", CTHQ_D01: "2026-10-16", CTHQ_T01: "Kiểm tra hồ sơ", CTHQ_I01: "Bổ sung C/O",
    });
  });
  it("EDA: khóa mẫu 02 (TK_ECN, TK_K10, TK_ETA, TK_RC/RD, TK_K86…)", () => {
    expect(customsValues("EDA", info, { channel: "GREEN", clearanceStatus: "WAITING" })).toMatchObject({
      TK_ECN: "107624410320", TK_K10: "2026-10-16", TK_RT1: "10:12:00", TK_K07: "2", TK_K69: "3", TK_K70: "2", TK_LUONG: "1", TK_THONGQUAN: "0",
      TK_ETA: "155000", TK_AD7: "VND", TK_RC1: "USD", TK_RD1: "25450", TK_K86: "2026-10-17", TK_K87: "Nguyễn Văn A",
    });
  });
  it("chưa có phản hồi → không ô nào; có kết quả mà chưa có thông tin → vẫn có số tờ khai / phân luồng", () => {
    expect(customsValues("IDA", null, null)).toEqual({});
    expect(customsValues("IDA", null, { declarationNo: "1076", channel: "RED" })).toEqual({ TK_ICN: "1076", TK_LUONG: "3" });
  });
  it.each(["IDA", "EDA"] as const)("%s: mọi ô sinh ra có trên bố cục", (kind) => {
    const keys = new Set(layoutFields(kind === "IDA" ? LAYOUT_IDA : LAYOUT_EDA).map((f) => f.key));
    const v = customsValues(kind, info, { channel: "GREEN", clearanceStatus: "CLEARED" });
    expect(Object.keys(v).filter((k) => !keys.has(k))).toEqual([]);
    const items = customsItemValues(kind, info, [1, 2]);
    expect(items.flatMap((it) => Object.keys(it)).filter((k) => !keys.has(k))).toEqual([]);
  });
});

describe("customsItemValues – trị giá / thuế Hải quan tính, theo thứ tự dòng hàng của tờ khai", () => {
  it("IDA: ghép theo số dòng; dòng chưa có → rỗng", () => {
    expect(customsItemValues("IDA", info, [1, 2, 3])).toEqual([
      { HAG_B36: "400000", HAG_B43: "5", HAG_B47: "20000" },
      { HAG_B36: "600000", HAG_B50: "VND", HAG_B43: "5", HAG_B47: "30000" },
      {},
    ]);
  });
  it("EDA: HAG_R07 / HAG_ADB / HAG_TRA / HAG_TAX", () => {
    expect(customsItemValues("EDA", info, [2])).toEqual([{ HAG_R07: "600000", HAG_ADB: "VND", HAG_TRA: "5", HAG_TAX: "30000" }]);
  });
});
