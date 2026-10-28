import { describe, expect, it } from "vitest";
import { chargesConflict, EMPTY_VALUE_CHARGES, freightTermFit, incotermIncludesFreight, incotermOf, ValueChargesSchema } from "./value-charges.js";

describe("incotermOf", () => {
  it("lấy mã đầu, gộp C&F / C&I, bỏ tiền tố Incoterms; không nhận ra → rỗng", () => {
    expect(incotermOf("CIF HAIPHONG")).toBe("CIF");
    expect(incotermOf("fca busan")).toBe("FCA");
    expect(incotermOf("C AND F Haiphong")).toBe("C&F");
    expect(incotermOf("CNF")).toBe("C&F");
    expect(incotermOf("Incoterms 2020 DAP Hanoi")).toBe("DAP");
    expect(incotermOf(null)).toBe("");
    expect(incotermOf("  ")).toBe("");
  });
});

describe("freightTermFit – điều kiện giao hàng ↔ người trả cước trên vận đơn", () => {
  it("nhóm C/D: Prepaid khớp, Collect mâu thuẫn", () => {
    expect(freightTermFit("CIF", "PREPAID")).toBe("OK");
    expect(freightTermFit("CIF HAIPHONG", "COLLECT")).toBe("CONFLICT");
    expect(freightTermFit("C&F", "collect")).toBe("CONFLICT");
    expect(freightTermFit("DAP", "COLLECT")).toBe("CONFLICT");
  });
  it("nhóm E/F: Collect khớp, Prepaid cần kiểm tra", () => {
    expect(freightTermFit("FCA", "COLLECT")).toBe("OK");
    expect(freightTermFit("FOB", "PREPAID")).toBe("CHECK");
  });
  it("thiếu điều kiện giao hàng / vận đơn không ghi / mã lạ → không kết luận", () => {
    expect(freightTermFit("", "COLLECT")).toBe("UNKNOWN");
    expect(freightTermFit("CIF", null)).toBe("UNKNOWN");
    expect(freightTermFit("XYZ", "COLLECT")).toBe("UNKNOWN");
  });
  it("incotermIncludesFreight: nhóm C/D gồm cước, E/F không", () => {
    expect(incotermIncludesFreight("CIF")).toBe(true);
    expect(incotermIncludesFreight("C&F")).toBe(true);
    expect(incotermIncludesFreight("FCA")).toBe(false);
  });
});

describe("ValueCharges – giải trình người trả cước", () => {
  it("lý do Khác phải có ghi chú; dữ liệu cũ không có freightTermNote vẫn hợp lệ", () => {
    expect(ValueChargesSchema.safeParse({ ...EMPTY_VALUE_CHARGES, freightTermNote: { reason: "OTHER", note: "" } }).success).toBe(false);
    expect(ValueChargesSchema.safeParse({ ...EMPTY_VALUE_CHARGES, freightTermNote: { reason: "LOCAL_CHARGES", note: "" } }).success).toBe(true);
    expect(ValueChargesSchema.safeParse({ freight: null, insurance: null, adjustments: null }).success).toBe(true);
  });
  it("chargesConflict không chặn lưu giải trình", () => {
    const ctx = { direction: "NK" as const, freightRequired: false, fromDocuments: { freight: { amount: "1150", currency: "USD", kind: null }, insurance: null, other: [] } };
    expect(chargesConflict({ ...EMPTY_VALUE_CHARGES, freightTermNote: { reason: "LOCAL_CHARGES", note: "" } }, ctx)).toBeNull();
  });
});
