import { describe, expect, it } from "vitest";
import { mergeExtractions, type FileExtraction } from "../merge.js";
import { ocrExitBlockers } from "../ocr-exit.js";

const inv = (paymentTerms: string | null, origins: (string | null)[]): FileExtraction => ({
  documentId: "doc_inv", kind: "INVOICE", pages: 1,
  data: { invoiceNo: "INV-1", paymentTerms, items: origins.map((origin, i) => ({ lineNo: i + 1, description: `Item ${i + 1}`, quantity: 1, unit: "PCE", unitPrice: 1, amount: 1, origin })) },
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
});
