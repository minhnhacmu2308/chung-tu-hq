import { describe, expect, it } from "vitest";
import { compareFields, scoreSample, summarize } from "../accuracy.js";
import { applyFieldPatch, canAddField, canRemoveField, resolveCandidates } from "../field-rules.js";

const FIELDS = [
  { key: "invoice_no", label: "Số hóa đơn", type: "code" as const, required: true, aliases: ["Invoice No."], extract: true, display: true },
  { key: "total_amount", label: "Tổng", type: "decimal" as const, required: true, aliases: [], extract: true, display: true },
  { key: "invoice_date", label: "Ngày", type: "date" as const, required: false, aliases: [], extract: true, display: true },
  { key: "seller", label: "Người bán", type: "party" as const, required: false, aliases: [], extract: true, display: true },
  { key: "note", label: "Ghi chú", type: "string" as const, required: false, aliases: [], extract: false, display: false },
];

describe("accuracy", () => {
  it("compareFields: chuỗi/mã so sau chuẩn hóa; số sai số 0,01; ngày bằng nhau; party theo tên ~0,6", () => {
    expect(compareFields("code", "HSP-2610-0457", "hsp 2610 0457")).toBe(true);
    expect(compareFields("decimal", "20850", 20850.004)).toBe(true);
    expect(compareFields("decimal", "20850", "20851")).toBe(false);
    expect(compareFields("date", "2026-10-02", "2026-10-02")).toBe(true);
    expect(compareFields("party", { name: "Hansol Precision Co., Ltd" }, { name: "HANSOL PRECISION CO LTD" })).toBe(true);
    expect(compareFields("party", { name: "Hansol" }, { name: "Samsung" })).toBe(false);
    // items: jsonb trả về key theo thứ tự khác → vẫn bằng nhau.
    expect(compareFields("items", [{ lineNo: 1, description: "A", quantity: 2 }], [{ quantity: 2, description: "A", lineNo: 1 }])).toBe(true);
    expect(compareFields("items", [{ lineNo: 1, quantity: 2 }], [{ lineNo: 1, quantity: 3 }])).toBe(false);
    expect(compareFields("string", null, null)).toBe(true);
    expect(compareFields("string", "x", null)).toBe(false);
  });
  it("scoreSample: tính đúng/sai từng trường extract=true; summarize gộp nhiều mẫu, errors = số mẫu sai", () => {
    const s1 = scoreSample(FIELDS, { invoice_no: "A1", total_amount: "100", invoice_date: "2026-10-02", seller: { name: "X" } }, { invoice_no: "A1", total_amount: "100.00", invoice_date: "2026-10-03", seller: { name: "X" } });
    expect(s1).toEqual({ invoice_no: true, total_amount: true, invoice_date: false, seller: true });
    const s2 = scoreSample(FIELDS, { invoice_no: "B2", total_amount: "5", invoice_date: null, seller: null }, { invoice_no: "B3", total_amount: "5", invoice_date: null, seller: null });
    const sum = summarize(FIELDS, [s1, s2]);
    expect(sum.fields.find((f) => f.key === "invoice_no")).toEqual({ key: "invoice_no", label: "Số hóa đơn", accuracy: 0.5, errors: 1 });
    expect(sum.fields.find((f) => f.key === "invoice_date")?.errors).toBe(1);
    expect(sum.fields.some((f) => f.key === "note")).toBe(false);
    expect(sum.accuracy).toBeCloseTo(6 / 8, 5);
  });
});

describe("field-rules", () => {
  it("applyFieldPatch: tắt extract trường bắt buộc → FORBIDDEN; tắt extract thì display cũng tắt", () => {
    const r = applyFieldPatch(FIELDS, "invoice_no", { extract: false });
    expect(r.ok).toBe(false);
    const ok = applyFieldPatch(FIELDS, "invoice_date", { extract: false });
    expect(ok.ok && ok.value.find((f) => f.key === "invoice_date")).toMatchObject({ extract: false, display: false });
    expect(applyFieldPatch(FIELDS, "nope", { label: "x" }).ok).toBe(false);
  });
  it("canAddField: key trùng → DUPLICATE; hợp lệ → ok; quá 20 trường bổ sung → VALIDATION", () => {
    expect(canAddField("INVOICE", FIELDS, "invoice_no").ok).toBe(false);
    expect(canAddField("INVOICE", FIELDS, "po_no").ok).toBe(true);
    const many = Array.from({ length: 20 }, (_, i) => ({ ...FIELDS[0]!, key: `extra_${i}` }));
    expect(canAddField("INVOICE", [...FIELDS, ...many], "extra_x")).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(canAddField("INVOICE", [...FIELDS, ...many], "po_no").ok).toBe(true); // trường chuẩn không tính vào giới hạn
  });
  it("canRemoveField: trường chuẩn trong danh mục → FORBIDDEN (tắt đọc/hiển thị thay vì xóa); trường bổ sung → ok", () => {
    expect(canRemoveField("INVOICE", FIELDS, "invoice_no")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(canRemoveField("INVOICE", [...FIELDS, { ...FIELDS[0]!, key: "lc_no" }], "lc_no").ok).toBe(true);
    expect(canRemoveField("INVOICE", FIELDS, "nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("resolveCandidates: SUPPLIER khớp tên nhà cung cấp ưu tiên, rồi DOCUMENT theo loại, chỉ enabled", () => {
    const skills = [
      { id: "a", kind: "DOCUMENT" as const, docKind: "INVOICE" as const, supplier: null, enabled: true },
      { id: "b", kind: "SUPPLIER" as const, docKind: "INVOICE" as const, supplier: "HANSOL PRECISION CO., LTD.", enabled: true },
      { id: "c", kind: "SUPPLIER" as const, docKind: "INVOICE" as const, supplier: "ARTEMIDE", enabled: false },
      { id: "d", kind: "DOCUMENT" as const, docKind: "PACKING_LIST" as const, supplier: null, enabled: true },
    ];
    expect(resolveCandidates(skills, "INVOICE", "Hansol Precision")?.id).toBe("b");
    expect(resolveCandidates(skills, "INVOICE", "Artemide")?.id).toBe("a");
    expect(resolveCandidates(skills, "INVOICE", null)?.id).toBe("a");
    expect(resolveCandidates(skills, "CERT_OF_ORIGIN", null)).toBeNull();
  });
});

describe("schema-keys", () => {
  it("key skill → key kết quả AI: ngoại lệ bảng, còn lại snake→camel; projectResult lấy theo trường extract, thiếu → null", async () => {
    const { fieldHints, projectResult } = await import("../schema-keys.js");
    expect(projectResult("INVOICE", FIELDS, { invoiceNo: "A1", totalAmount: 100, seller: { name: "X" }, note: "bỏ" })).toEqual({ invoice_no: "A1", total_amount: 100, invoice_date: null, seller: { name: "X" } });
    expect(fieldHints("INVOICE", FIELDS)[0]).toContain("Invoice No.");
    expect(fieldHints("INVOICE", FIELDS)[0]).toContain("(invoiceNo)");
    expect(fieldHints("INVOICE", FIELDS)).toHaveLength(4);
  });
  it("trường bổ sung riêng: lấy từ result.custom; gợi ý ghi rõ là trường bổ sung", async () => {
    const { fieldHints, projectResult } = await import("../schema-keys.js");
    const withCustom = [...FIELDS, { key: "lc_no", label: "Số L/C", type: "string" as const, required: false, aliases: ["L/C No"], extract: true, display: true }];
    expect(projectResult("INVOICE", withCustom, { invoiceNo: "A1", custom: { lc_no: "LC-9" } })).toMatchObject({ invoice_no: "A1", lc_no: "LC-9" });
    expect(projectResult("INVOICE", withCustom, { invoiceNo: "A1" })).toMatchObject({ lc_no: null });
    expect(fieldHints("INVOICE", withCustom).at(-1)).toBe("Số L/C (custom.lc_no – trường bổ sung): nhãn thường gặp L/C No");
  });
});
