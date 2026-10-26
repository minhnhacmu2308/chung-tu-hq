import { describe, expect, it } from "vitest";
import { CATALOG_EDA } from "../declaration/catalog-eda.js";
import { CATALOG_IDA } from "../declaration/catalog-ida.js";
import { attachmentPairs, checkHysSubmission, fillAttachmentSlot, hysExtensionAllowed, satisfiedHysCodes, suggestHys } from "./rules.js";

const ok = [{ fileName: "a.pdf", sizeBytes: 100 }];
const base = { procedureCode: "A02", customsOffice: "01B1", processingUnit: "01", phone: null, internalRef: null, note: null, files: ok };
const maxLenOf = (no: string) => [...CATALOG_IDA, ...CATALOG_EDA].find((d) => d.no === no)?.maxLen ?? 0;
type SuggestInput = Parameters<typeof suggestHys>[0];
const codes = (x: Partial<SuggestInput> & Pick<SuggestInput, "kind" | "values">) =>
  suggestHys({ containerCount: 0, satisfied: new Set(), ...x }).map((s) => s.code);
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

describe("fillAttachmentSlot", () => {
  it("điền cặp", () => {
    expect(fillAttachmentSlot({}, "A02", "300000000001")).toEqual({ outcome: "FILLED", slot: 1, set: { TK_EA1: "A02", TK_EB1: "300000000001" } });
    expect(fillAttachmentSlot({ TK_EA1: "A01", TK_EB1: "1", TK_EB2: "  " }, "A02", "2")).toMatchObject({ outcome: "FILLED", slot: 2 });
    expect(fillAttachmentSlot({ TK_EB2: "2" }, "A02", "2")).toEqual({ outcome: "ALREADY", slot: 2 });
    expect(fillAttachmentSlot({ TK_EB1: "1", TK_EB2: "2", TK_EB3: "3" }, "A02", "4")).toEqual({ outcome: "FULL" });
  });
  const full = { TK_EA1: "A01", TK_EB1: "1", TK_EA2: "A02", TK_EB2: "2", TK_EA3: "A08", TK_EB3: "3" };
  it("đủ 3 cặp + replaceSlot → thay cặp đã chọn, trả giá trị cũ", () => {
    expect(fillAttachmentSlot(full, "A99", " 4 ", 2)).toEqual({
      outcome: "REPLACED",
      slot: 2,
      set: { TK_EA2: "A99", TK_EB2: "4" },
      replaced: { code: "A02", receipt: "2" },
    });
  });
  it("replaceSlot không dùng khi còn cặp trống hoặc số đã có", () => {
    expect(fillAttachmentSlot({ TK_EB1: "1" }, "A02", "4", 1)).toMatchObject({ outcome: "FILLED", slot: 2 });
    expect(fillAttachmentSlot(full, "A02", "3", 1)).toEqual({ outcome: "ALREADY", slot: 3 });
  });
});

describe("attachmentPairs", () => {
  it("chỉ các cặp có số tiếp nhận, theo thứ tự cặp", () => {
    expect(attachmentPairs({ TK_EA1: "A01", TK_EB1: " 1 ", TK_EA2: "A02", TK_EB2: " ", TK_EB3: "3" })).toEqual([
      { slot: 1, code: "A01", receipt: "1" },
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
    const out = suggestHys({ kind: "IDA", values: { TK_IV1: "B", TK_NT2: long }, containerCount: 0, satisfied: new Set() });
    expect(out.map((s) => s.code)).toEqual(["A99"]);
    expect(out[0]?.rule).toBe("G2");
  });
  it("bỏ mã đã khai", () => {
    expect(codes({ kind: "IDA", values: { VD_COC: "2" }, satisfied: new Set(["A02"]) })).toEqual([]);
  });
});

describe("satisfiedHysCodes", () => {
  it("cặp 1.63 đủ mã + số ∪ bộ ACCEPTED đã điền được (FILLED/ALREADY/REPLACED) mà số còn trong 1.63", () => {
    expect(
      [...satisfiedHysCodes({ TK_EA1: "A02", TK_EB1: "300000000001", TK_EA2: "A01", TK_EB2: "300000000002", TK_EB3: " 300000000003 " }, [
        { procedureCode: "A08", status: "ACCEPTED", receiptNo: "300000000003", fill: { outcome: "FILLED" } },
        { procedureCode: "A01", status: "ACCEPTED", receiptNo: "300000000002", fill: { outcome: "ALREADY" } },
        { procedureCode: "A99", status: "DRAFT", receiptNo: null, fill: null },
      ])].sort(),
    ).toEqual(["A01", "A02", "A08"]);
  });
  it("bộ đã điền nhưng số bị bộ sau thay (không còn trong 1.63) → không còn tính là đã khai", () => {
    const values = { TK_EA1: "A01", TK_EB1: "300000000001", TK_EA2: "A99", TK_EB2: "300000000009" };
    expect(
      [...satisfiedHysCodes(values, [
        { procedureCode: "A02", status: "ACCEPTED", receiptNo: "300000000002", fill: { outcome: "FILLED" } },
        { procedureCode: "A99", status: "ACCEPTED", receiptNo: "300000000009", fill: { outcome: "REPLACED" } },
      ])].sort(),
    ).toEqual(["A01", "A99"]);
  });
  it("bộ đang gửi chưa tính là đã khai (số chưa vào 1.63)", () => {
    expect([...satisfiedHysCodes({}, [{ procedureCode: "A02", status: "SENDING", receiptNo: null, fill: null }])]).toEqual([]);
  });
  it("ACCEPTED nhưng không điền được (LOCKED/FULL/NO_RECEIPT/chưa có) chưa tính là đã khai", () => {
    for (const fill of [{ outcome: "LOCKED" as const }, { outcome: "FULL" as const }, { outcome: "NO_RECEIPT" as const }, null]) {
      expect([...satisfiedHysCodes({}, [{ procedureCode: "A02", status: "ACCEPTED", receiptNo: "300000000002", fill }])]).toEqual([]);
    }
  });
});
