import { describe, expect, it } from "vitest";
import { CATALOG_EDA } from "../declaration/catalog-eda.js";
import { CATALOG_IDA } from "../declaration/catalog-ida.js";
import { attachKindOfDoc, attachmentPairs, checkHysSubmission, fillAttachmentSlot, hysExtensionAllowed, hysSatisfaction, suggestAttachKind, suggestHys, type HysSatisfaction } from "./rules.js";

const ok = [{ fileName: "a.pdf", sizeBytes: 100 }];
const base = { procedureCode: "A02", customsOffice: "01B1", processingUnit: "01", phone: null, internalRef: null, note: null, files: ok };
const maxLenOf = (no: string) => [...CATALOG_IDA, ...CATALOG_EDA].find((d) => d.no === no)?.maxLen ?? 0;
type SuggestInput = Parameters<typeof suggestHys>[0];
const NONE: HysSatisfaction = { codes: new Set(), rules: new Set() };
const codes = (x: Partial<SuggestInput> & Pick<SuggestInput, "kind" | "values">) =>
  suggestHys({ containerCount: 0, satisfied: NONE, ...x }).map((s) => s.code);
const long = "x".repeat(maxLenOf("1.68") + 1);

describe("checkHysSubmission", () => {
  it("đuôi file", () => {
    expect(hysExtensionAllowed("HÓA ĐƠN.PDF")).toBe(true);
    expect(hysExtensionAllowed("a.zip")).toBe(false);
    expect(hysExtensionAllowed("noext")).toBe(false);
  });
  it("kiểm bộ file", () => {
    expect(checkHysSubmission(base)).toEqual([]);
    expect(checkHysSubmission({ ...base, files: [{ fileName: "a.pdf", sizeBytes: 2_097_152 }] })).toEqual([]);
    expect(checkHysSubmission({ ...base, files: [{ fileName: "a.pdf", sizeBytes: 2_097_153 }] })).toContainEqual({ code: "TOO_LARGE", bytes: 2_097_153 });
    expect(checkHysSubmission({ ...base, files: [] })).toContainEqual({ code: "NO_FILE" });
    expect(checkHysSubmission({ ...base, files: [{ fileName: "a.zip", sizeBytes: 1 }] })).toContainEqual({ code: "BAD_EXTENSION", file: "a.zip" });
    expect(checkHysSubmission({ ...base, procedureCode: null })).toContainEqual({ code: "MISSING_PROCEDURE" });
    expect(checkHysSubmission({ ...base, customsOffice: " " })).toContainEqual({ code: "MISSING_OFFICE" });
    // TK_CHB (nhóm xử lý hồ sơ) là chỉ tiêu có điều kiện (6001-2_HYS_Input_Data_Element) – để trống vẫn gửi được.
    expect(checkHysSubmission({ ...base, processingUnit: null })).toEqual([]);
    expect(checkHysSubmission({ ...base, phone: "1".repeat(21) })).toContainEqual({ code: "TOO_LONG", field: "TK_STL" });
    expect(checkHysSubmission({ ...base, phone: "1".repeat(20), note: "n".repeat(333) })).toEqual([{ code: "TOO_LONG", field: "TK_KJJ" }]);
  });
});

describe("fillAttachmentSlot (TK_EA = phân loại đính kèm, TK_EB = số tiếp nhận)", () => {
  it("điền cặp", () => {
    expect(fillAttachmentSlot({}, "INV", "300000000001")).toEqual({ outcome: "FILLED", slot: 1, set: { TK_EA1: "INV", TK_EB1: "300000000001" } });
    expect(fillAttachmentSlot({ TK_EA1: "BOL", TK_EB1: "1", TK_EB2: "  " }, "ETC", "2")).toMatchObject({ outcome: "FILLED", slot: 2 });
    expect(fillAttachmentSlot({ TK_EB2: "2" }, "ETC", "2")).toEqual({ outcome: "ALREADY", slot: 2 });
    expect(fillAttachmentSlot({ TK_EB1: "1", TK_EB2: "2", TK_EB3: "3" }, "ETC", "4")).toEqual({ outcome: "FULL" });
  });
  const full = { TK_EA1: "INV", TK_EB1: "1", TK_EA2: "BOL", TK_EB2: "2", TK_EA3: "ETC", TK_EB3: "3" };
  it("đủ 3 cặp + replaceSlot → thay cặp đã chọn, trả giá trị cũ", () => {
    expect(fillAttachmentSlot(full, "ALL", " 4 ", 2)).toEqual({
      outcome: "REPLACED",
      slot: 2,
      set: { TK_EA2: "ALL", TK_EB2: "4" },
      replaced: { code: "BOL", receipt: "2" },
    });
  });
  it("replaceSlot không dùng khi còn cặp trống hoặc số đã có", () => {
    expect(fillAttachmentSlot({ TK_EB1: "1" }, "ETC", "4", 1)).toMatchObject({ outcome: "FILLED", slot: 2 });
    expect(fillAttachmentSlot(full, "ETC", "3", 1)).toEqual({ outcome: "ALREADY", slot: 3 });
  });
});

describe("attachmentPairs", () => {
  it("chỉ các cặp có số tiếp nhận, theo thứ tự cặp; mã chuẩn hóa", () => {
    expect(attachmentPairs({ TK_EA1: "INV – Hóa đơn", TK_EB1: " 1 ", TK_EA2: "BOL", TK_EB2: " ", TK_EB3: "3" })).toEqual([
      { slot: 1, code: "INV", receipt: "1" },
      { slot: 3, code: "", receipt: "3" },
    ]);
    expect(attachmentPairs({})).toEqual([]);
  });
});

describe("suggestHys", () => {
  it("G1", () => {
    expect(codes({ kind: "IDA", values: { VD_COC: "2" } })).toEqual(["A02"]);
    expect(codes({ kind: "IDA", values: {}, containerCount: 1 })).toEqual(["A02"]);
    expect(codes({ kind: "EDA", values: {}, containerCount: 50 })).toEqual([]);
    expect(codes({ kind: "EDA", values: {}, containerCount: 51 })).toEqual(["A02"]);
  });
  it("G2", () => {
    expect(codes({ kind: "IDA", values: { TK_IV1: "B" } })).toEqual(["A99"]);
  });
  it("G3", () => {
    expect(codes({ kind: "IDA", values: { KTG_VD1: "6" } })).toEqual([]);
    expect(codes({ kind: "IDA", values: { KTG_VD1: "7 – Phương pháp suy ra" } })).toEqual([]);
    expect(codes({ kind: "IDA", values: { KTG_VD1: "1" } })).toEqual(["A01"]);
    expect(codes({ kind: "IDA", values: { KTG_VD1: "6", KTG_FR1: "D" } })).toEqual(["A01"]);
    expect(codes({ kind: "EDA", values: { KTG_VD1: "1" } })).toEqual([]);
  });
  it("G4, G5", () => {
    expect(codes({ kind: "EDA", values: { TK_ENC: "A" } })).toEqual(["A08"]);
    expect(codes({ kind: "IDA", values: { TK_NT2: long } })).toEqual(["A99"]);
    expect(codes({ kind: "IDA", values: { TK_NT2: "x".repeat(maxLenOf("1.68")) } })).toEqual([]);
    expect(codes({ kind: "EDA", values: { TK_NT2: "x".repeat(maxLenOf("2.57") + 1) } })).toEqual(["A99"]);
  });
  it("gộp trùng mã, giữ rule đầu", () => {
    const out = suggestHys({ kind: "IDA", values: { TK_IV1: "B", TK_NT2: long }, containerCount: 0, satisfied: NONE });
    expect(out.map((s) => s.code)).toEqual(["A99"]);
    expect(out[0]?.rule).toBe("G2");
  });
  it("bỏ mã đã khai (bộ HYS) – mọi rule của mã", () => {
    expect(codes({ kind: "IDA", values: { VD_COC: "2" }, satisfied: { codes: new Set(["A02"]), rules: new Set() } })).toEqual([]);
    expect(codes({ kind: "IDA", values: { TK_IV1: "B", TK_NT2: long }, satisfied: { codes: new Set(["A99"]), rules: new Set() } })).toEqual([]);
  });
  it("A99 chỉ tắt khi mọi rule sinh ra A99 đều thỏa: cặp INV thỏa G2, G5 vẫn còn", () => {
    const out = suggestHys({ kind: "IDA", values: { TK_IV1: "B", TK_NT2: long }, containerCount: 0, satisfied: { codes: new Set(), rules: new Set(["G2"]) } });
    expect(out).toEqual([{ code: "A99", rule: "G5", fieldNo: "1.68" }]);
    expect(codes({ kind: "IDA", values: { TK_IV1: "B" }, satisfied: { codes: new Set(), rules: new Set(["G2"]) } })).toEqual([]);
  });
});

describe("attachKind – phân loại đính kèm (1.63/2.53 ô 1) theo chứng từ", () => {
  it("map loại chứng từ → mã", () => {
    expect(attachKindOfDoc("INVOICE")).toBe("INV");
    expect(attachKindOfDoc("FREIGHT_INVOICE")).toBe("INV");
    expect(attachKindOfDoc("BILL_OF_LADING")).toBe("BOL");
    expect(attachKindOfDoc("AIR_WAYBILL")).toBe("AWB");
    expect(attachKindOfDoc("SALES_CONTRACT")).toBe("CON");
    for (const k of ["PACKING_LIST", "CERT_OF_ORIGIN", "ARRIVAL_NOTICE", "OTHER"] as const) expect(attachKindOfDoc(k)).toBe("ETC");
  });
  it("đề xuất theo tập chứng từ hồ sơ đã chọn: rỗng → ETC; 1 mã → mã đó; ≥ 2 mã → ALL", () => {
    expect(suggestAttachKind([])).toBe("ETC");
    expect(suggestAttachKind(["INVOICE", "FREIGHT_INVOICE"])).toBe("INV");
    expect(suggestAttachKind(["PACKING_LIST"])).toBe("ETC");
    expect(suggestAttachKind(["INVOICE", "BILL_OF_LADING"])).toBe("ALL");
    expect(suggestAttachKind(["INVOICE", "PACKING_LIST"])).toBe("ALL");
  });
});

describe("hysSatisfaction – đã khai", () => {
  const sub = (procedureCode: string, status: string, receiptNo: string | null) => ({ procedureCode, status, receiptNo });
  it("bộ ACCEPTED có số đang nằm trong TK_EB1..3 → đã khai mã thủ tục của bộ", () => {
    const s = hysSatisfaction({ TK_EA1: "ETC", TK_EB1: "300000000001", TK_EA2: "INV", TK_EB2: " 300000000002 " }, [
      sub("A02", "ACCEPTED", "300000000001"),
      sub("A99", "ACCEPTED", "300000000002"),
      sub("A01", "ACCEPTED", "300000000005"),
      sub("A08", "SENDING", null),
    ]);
    expect([...s.codes].sort()).toEqual(["A02", "A99"]);
    // Cặp mang số của bộ HYS không phải cặp nhập tay (INV của bộ A99 không thỏa thêm rule).
    expect([...s.rules]).toEqual([]);
  });
  it("bộ chưa ACCEPTED dù số có trong 1.63 → chưa tính; bộ bị thay cặp (số không còn) → không tính", () => {
    expect([...hysSatisfaction({ TK_EA1: "ETC", TK_EB1: "300000000001" }, [sub("A02", "SENDING", "300000000001")]).codes]).toEqual([]);
    expect([...hysSatisfaction({ TK_EA1: "ETC", TK_EB1: "300000000009" }, [sub("A02", "ACCEPTED", "300000000001")]).codes]).toEqual([]);
  });
  it("cặp nhập tay: INV → thỏa G2; ALL → thỏa mọi gợi ý; mã khác → không thỏa", () => {
    expect([...hysSatisfaction({ TK_EA1: "INV", TK_EB1: "123" }, []).rules]).toEqual(["G2"]);
    expect([...hysSatisfaction({ TK_EA1: "ALL – Tất cả hồ sơ", TK_EB1: "123" }, []).rules].sort()).toEqual(["G1", "G2", "G3", "G4", "G5"]);
    const other = hysSatisfaction({ TK_EA1: "BOL", TK_EB1: "123", TK_EA2: "A02", TK_EB2: "456", TK_EA3: "INV" }, []);
    expect([...other.codes, ...other.rules]).toEqual([]);
  });
  it("cặp có số thuộc bộ HYS bất kỳ của hồ sơ (kể cả chưa ACCEPTED) không phải cặp nhập tay", () => {
    expect([...hysSatisfaction({ TK_EA1: "ALL", TK_EB1: "300000000001" }, [sub("A02", "REJECTED", "300000000001")]).rules]).toEqual([]);
  });
});
