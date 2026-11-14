import { describe, expect, it } from "vitest";
import { mergeExtractions, type FileExtraction } from "../merge.js";
import { confirmedItemValues, mergeIdenticalLines } from "../merge-lines.js";
import { projectFields } from "../project-fields.js";

const inv: FileExtraction = {
  documentId: "doc_inv", kind: "INVOICE", pages: 1,
  data: {
    invoiceNo: "INV-1",
    items: [
      { lineNo: 1, description: "Frozen fish", quantity: 1930, unit: "KGM", unitPrice: 2.35, amount: 4535.5, origin: "ID" },
      { lineNo: 2, description: "Squid", quantity: 10, unit: "KGM", unitPrice: 3, amount: 30, origin: "ID" },
      { lineNo: 3, description: "FROZEN FISH", quantity: 0.1, unit: "KGM", unitPrice: 2.35, amount: 0.235, origin: "ID" },
    ],
  },
};

describe("mergeIdenticalLines", () => {
  it("gộp dòng giống nhau: giữ số dòng + nguồn dòng đầu, cộng Decimal số lượng / thành tiền, ghi chú; dòng khác giữ nguyên số dòng", () => {
    const s = mergeExtractions([inv], { version: 1, taxCodeValid: () => true });
    mergeIdenticalLines(s);
    expect(s.items.map((it) => it.lineNo)).toEqual([1, 2]);
    expect(s.items[0]!.quantity).toMatchObject({ value: "1930.1", note: "Gộp dòng 1, 3" });
    expect(s.items[0]!.amount.value).toBe("4535.735");
    expect(s.items[0]!.quantity.sources[0]!.documentId).toBe("doc_inv");
    // Trường OCR của dòng gộp mang ghi chú; dòng bị gộp không còn trường.
    const f = projectFields(s);
    expect(f.find((x) => x.key === "item.1.quantity")).toMatchObject({ value: "1930.1", note: "Gộp dòng 1, 3" });
    expect(f.some((x) => x.key.startsWith("item.3."))).toBe(false);
  });
  it("không có dòng giống nhau → không đổi", () => {
    const s = mergeExtractions([{ ...inv, data: { ...inv.data, items: (inv.data["items"] as unknown[]).slice(0, 2) } }], { version: 1, taxCodeValid: () => true });
    const before = JSON.stringify(s.items);
    mergeIdenticalLines(s);
    expect(JSON.stringify(s.items)).toBe(before);
  });
  it("gộp theo giá trị người khai đã xác nhận: hóa đơn không ghi xuất xứ, người khai chọn CN / VN → không gộp; cùng CN → gộp; khác Part No → không gộp", () => {
    const noOrigin: FileExtraction = { ...inv, data: { ...inv.data, items: (inv.data["items"] as Record<string, unknown>[]).map((it) => ({ ...it, origin: null })) } };
    const s1 = mergeExtractions([noOrigin], { version: 1, taxCodeValid: () => true });
    expect(mergeIdenticalLines(s1, confirmedItemValues([{ key: "item.1.origin", value: "CN" }, { key: "item.3.origin", value: "VN" }]))).toEqual([]);
    expect(s1.items.map((it) => it.lineNo)).toEqual([1, 2, 3]);
    // Chỉ dùng để xét nhóm – shipment không bị ghi giá trị người khai.
    expect(s1.items[2]!.origin.value).toBeNull();
    const s2 = mergeExtractions([noOrigin], { version: 1, taxCodeValid: () => true });
    expect(mergeIdenticalLines(s2, confirmedItemValues([{ key: "item.1.origin", value: "CN" }, { key: "item.3.origin", value: "CN" }]))).toEqual([1]);
    expect(s2.items.map((it) => it.lineNo)).toEqual([1, 2]);
    const parts: FileExtraction = { ...inv, data: { ...inv.data, items: (inv.data["items"] as Record<string, unknown>[]).map((it, i) => ({ ...it, partNo: `P-${i}` })) } };
    const s3 = mergeExtractions([parts], { version: 1, taxCodeValid: () => true });
    mergeIdenticalLines(s3);
    expect(s3.items).toHaveLength(3);
  });
});

