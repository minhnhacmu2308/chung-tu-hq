import { describe, expect, it } from "vitest";
import { mergeExtractions, type FileExtraction } from "../merge.js";
import { ocrExitBlockers } from "../ocr-exit.js";

const inv = (paymentTerms: string | null, origins: (string | null)[], paymentMethodCode: string | null = null): FileExtraction => ({
  documentId: "doc_inv", kind: "INVOICE", pages: 1,
  data: { invoiceNo: "INV-1", paymentTerms, paymentMethodCode, items: origins.map((origin, i) => ({ lineNo: i + 1, description: `Item ${i + 1}`, quantity: 1, unit: "PCE", unitPrice: 1, amount: 1, origin })) },
});
const blockers = (f: FileExtraction) => ocrExitBlockers(mergeExtractions([f], { version: 1, taxCodeValid: () => true }));

describe("ocrExitBlockers", () => {
  it("dòng thiếu xuất xứ + PTTT không nhận ra → hai lý do; đủ dữ liệu (T/T nhận ra KC) → không chặn", () => {
    expect(blockers(inv("Payment by crypto", ["KR", null, null]))).toEqual([
      { reason: "ITEM_ORIGIN_MISSING", params: { lines: "2, 3" } },
      { reason: "PAYMENT_METHOD_UNKNOWN", params: { raw: "Payment by crypto" } },
    ]);
    expect(blockers(inv("T/T 30 days", ["KR"]))).toEqual([]);
    expect(blockers(inv(null, ["KR"]))).toEqual([]);
  });
  it("mã AI lệch mã nhận dạng từ khóa → chặn; khớp → không chặn", () => {
    expect(blockers(inv("L/C at sight", ["KR"], "TTR"))).toEqual([{ reason: "PAYMENT_METHOD_UNKNOWN", params: { raw: "L/C at sight" } }]);
    expect(blockers(inv("L/C at sight", ["KR"], "LC"))).toEqual([]);
    // Chứng từ không ghi PTTT → không chặn (màn OCR không có ô để chọn); mapping gợi ý mã AI.
    expect(blockers(inv(null, ["KR"], "KC"))).toEqual([]);
  });
  it("mã AI invoice LC, hợp đồng KC, chữ T/T → lấy mã invoice (LC) → chặn; cùng ca với test paymentHint của web (field-row.test.tsx)", () => {
    const sc: FileExtraction = { documentId: "doc_sc", kind: "SALES_CONTRACT", pages: 1, data: { contractNo: "SC-1", paymentMethodCode: "KC" } };
    const s = mergeExtractions([sc, inv("T/T", ["KR"], "LC")], { version: 1, taxCodeValid: () => true });
    expect(s.invoice.paymentMethodCode?.value).toBe("LC");
    expect(ocrExitBlockers(s)).toEqual([{ reason: "PAYMENT_METHOD_UNKNOWN", params: { raw: "T/T" } }]);
  });
});
