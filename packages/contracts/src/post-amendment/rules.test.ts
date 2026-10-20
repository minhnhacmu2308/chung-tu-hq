import { describe, expect, it } from "vitest";
import { AmaRequestSchema, fptKey, VN_AMA_HANG_ROWS, VN_AMA_ROWS } from "../fpt/index.js";
import { formatDec, parseDec, percentOf, roundDec } from "./decimal.js";
import { AMA_HEADER_LAYOUT } from "./layout.js";
import { amaFieldIssue, amaHeaderFrom, amaHeaderLocked, amaLineDelta, amaLineFrom, amaLineLocked, applyAmaLineEdit, processingContractNote, recalcAmaLine } from "./rules.js";

describe("số thập phân chuỗi", () => {
  it("cộng, nhân %, làm tròn nửa lên, nhận dấu phẩy ngăn nghìn", () => {
    const v = parseDec("78,721,520.22")!;
    expect(formatDec(percentOf(v, parseDec("5")!))).toBe("3936076.011");
    expect(formatDec(roundDec(parseDec("0.00005")!, 4))).toBe("0.0001");
    expect(formatDec(roundDec(parseDec("-1.23455")!, 4))).toBe("-1.2346");
    expect(formatDec(parseDec("3936076.011")!, { scale: 4, fixed: true })).toBe("3936076.0110");
    expect(parseDec("12a")).toBeNull();
  });
});

describe("tự tính tiền thuế 'Sau' (khớp ảnh mẫu AMA)", () => {
  const line = { HAG_AKB: "78721520.22", HAG_AKR: "5%", HAG_AK1: "VB901", HAG_AR1: "10%" };
  it("thuế NK = trị giá × thuế suất; GTGT tính trên trị giá + thuế NK", () => {
    const out = recalcAmaLine(line, []);
    expect(out["HAG_AKA"]).toBe("3936076.0110");
    expect(out["HAG_AB1"]).toBe("82657596.231");
    expect(out["HAG_AA1"]).toBe("8265759.6231");
  });
  it("ô sửa tay giữ nguyên; thuế tuyệt đối không tự tính", () => {
    expect(recalcAmaLine(line, ["HAG_AKA"])["HAG_AKA"]).toBeUndefined();
    expect(recalcAmaLine({ ...line, HAG_AKR: "2000 VND/KGM" }, [])["HAG_AKA"]).toBeUndefined();
  });
  it("thu khác không phải GTGT (BVMT) cộng vào trị giá tính GTGT", () => {
    const out = recalcAmaLine({ HAG_AKB: "100", HAG_AKR: "0", HAG_AK1: "VB901", HAG_AR1: "10", HAG_AK2: "MB010", HAG_AR2: "x", HAG_AA2: "20" }, []);
    expect(out["HAG_AB1"]).toBe("120");
    expect(out["HAG_AA1"]).toBe("12.0000");
  });
  it("tăng/giảm = Sau − Trước", () => {
    expect(amaLineDelta({ HAG_MKA: "100", HAG_AKA: "150.5", HAG_MA1: "10", HAG_AA1: "8" })).toEqual({ importTax: "50.5", other: [{ slot: 1, amount: "-2" }] });
  });
  it("sửa ô tự tính → đánh dấu sửa tay; xóa trống → tự tính lại", () => {
    const base = { id: "l1", ran: 1, values: line, manual: [] };
    const edited = applyAmaLineEdit(base, "HAG_AKA", "1");
    expect(edited.manual).toEqual(["HAG_AKA"]);
    expect(edited.values["HAG_AKA"]).toBe("1");
    expect(applyAmaLineEdit(edited, "HAG_AKA", "").values["HAG_AKA"]).toBe("3936076.0110");
    expect(applyAmaLineEdit(base, "HAG_AKB", "100").values["HAG_AKA"]).toBe("5.0000");
  });
});

describe("điền sẵn từ tờ khai gốc", () => {
  it("đầu bản khai: nhập dùng người nhập khẩu, xuất dùng người xuất khẩu; ghi chú sau = trước", () => {
    const form = { TK_ICB: "A12", TK_CH: "10BB", TK_IMC: "0101", TK_EPC: "0202", TK_NT2: "SO HOP DONG: X", TK_ENC: "D" };
    const customs = { receivedAt: "2026-04-28T00:00:00Z", subsection: "00", registeredDate: "2026-04-23", permitDate: "2026-04-28", exchangeRates: [{ currency: "USD", rate: "25340" }], taxes: [], items: [], directives: [] };
    const nk = amaHeaderFrom({ direction: "NK", form, customs, declarationNo: "108173826831", currency: "USD" });
    expect(nk).toMatchObject({ TK_YNK: "I", TK_ICN: "108173826831", TK_ICB: "A12", TK_CHS: "10BB", TK_CHB: "00", TK_IDD: "2026-04-23", TK_IPD: "2026-04-28", TK_IMC: "0101", TK_TTC: "VND", TK_CDB: "USD", TK_RTB: "25340", TK_NTB: "SO HOP DONG: X", TK_NTA: "SO HOP DONG: X" });
    expect(amaHeaderFrom({ direction: "XK", form, customs: null, declarationNo: "3" })).toMatchObject({ TK_YNK: "E", TK_IMC: "0202", TK_IDD: "" });
  });
  it("dòng hàng: Trước từ tờ khai gốc + số Hải quan tính, Sau bằng Trước", () => {
    const v = amaLineFrom({
      lineNo: 1,
      values: { HAG_CMN: "Bột thạch anh", HAG_OR: "CN", HAG_CMD: "2506.10.00", HAG_QN1: "17255", HAG_QT1: "KGM" },
      customs: { lineNo: 1, hsCode: "25061000", customsValue: "78721520.22", taxRate: "5", taxAmountVnd: "3936076" },
      otherTaxes: [{ code: "VB901", rate: "10", base: "82657596.231", amount: "8265759.6231" }],
    });
    expect(v).toMatchObject({ HAG_RAN: "01", HAG_CMB: "Bột thạch anh", HAG_CMA: "Bột thạch anh", HAG_MKT: "25061000", HAG_AKT: "25061000", HAG_MKB: "78721520.22", HAG_AKA: "3936076", HAG_MK1: "VB901", HAG_AK1: "VB901", HAG_AA1: "8265759.6231" });
  });
  it("chèn hợp đồng gia công vào ghi chú", () => {
    expect(processingContractNote("WSYH-20260418", "2026-04-18")).toBe("SO HOP DONG: WSYH-20260418 ngày 18/04/2026");
  });
});

describe("ô khóa, kiểm tra giá trị, đặc tả", () => {
  it("định danh tờ khai gốc và phần Trước khóa; phần Sau sửa được", () => {
    for (const k of ["TK_ICN", "TK_ICB", "TK_RTB", "TK_NTB"]) expect(amaHeaderLocked(k)).toBe(true);
    for (const k of ["TK_REC", "TK_RTA", "TK_NTA", "TK_CHB"]) expect(amaHeaderLocked(k)).toBe(false);
    for (const k of ["HAG_MKB", "HAG_MA3", "HAG_CMB"]) expect(amaLineLocked(k)).toBe(true);
    for (const k of ["HAG_AKB", "HAG_AA3", "HAG_CMA", "APP_MA_HANG_TRUOC"]) expect(amaLineLocked(k)).toBe(false);
  });
  it("kiểm tra theo đặc tả: số, ngày, độ dài", () => {
    expect(amaFieldIssue("HAG_AKB", "12x")).toBe("Phải là số");
    expect(amaFieldIssue("TK_BYA", "2026.5")).toBe("Phải là số nguyên");
    expect(amaFieldIssue("TK_IDD", "23/04/2026")).toBe("Ngày dạng YYYY-MM-DD");
    expect(amaFieldIssue("TK_REC", "12")).toBe("Tối đa 1 ký tự");
    expect(amaFieldIssue("TK_REC", "6")).toBeNull();
  });
  it("đặc tả: mọi ô Request của VN_AMA có trên bố cục; schema gửi đi nhận dòng hàng", () => {
    const keys = new Set(AMA_HEADER_LAYOUT.flatMap((b) => b.items.flatMap((i) => (i.kind === "field" ? [i.key] : i.fields.map((f) => f.key)))));
    expect(VN_AMA_ROWS.map((r) => r[0]).filter((k) => !keys.has(k))).toEqual([]);
    expect(VN_AMA_HANG_ROWS.some((r) => r[0] === "HAG_MK1")).toBe(true);
    expect(VN_AMA_HANG_ROWS.map((r): string => r[0])).not.toContain("HAG_KI1");
    expect(AmaRequestSchema.safeParse({ objVN_AMA: {}, objVN_AMA_HANG: [] }).success).toBe(false);
    expect(fptKey("HAG_RAN")).toBe("haG_RAN");
  });
});
