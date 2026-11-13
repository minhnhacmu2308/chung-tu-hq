import { describe, expect, it } from "vitest";
import { DEFAULT_INVOICE_LAYOUT, InvoiceLayoutSchema } from "./api/invoice-template.js";
import { DEFAULT_INVOICE_NUMBERING, formatDocNo, InvoiceNumberingSchema, patternIssue, periodKey } from "./invoice-numbering.js";

describe("mẫu số hóa đơn", () => {
  it("mặc định INV{YY}{MM}-{NNN} → INV2611-001", () => {
    expect(formatDocNo(DEFAULT_INVOICE_NUMBERING.pattern, "2026-11-12", 1)).toBe("INV2611-001");
    expect(patternIssue(DEFAULT_INVOICE_NUMBERING.pattern, "MONTH")).toBeNull();
  });
  it("số thứ tự vượt độ dài tối thiểu thì dài thêm, không quay vòng", () => {
    expect(formatDocNo("A{NNN}", "2026-01-01", 1234)).toBe("A1234");
  });
  it("năm 4 chữ số, tháng, dấu phân cách", () => {
    expect(formatDocNo("HD/{YYYY}/{MM}.{NNNNN}", "2027-03-05", 42)).toBe("HD/2027/03.00042");
  });
  it.each([
    ["", "MONTH", "EMPTY"],
    ["inv{NNN}", "NEVER", null], // schema chuyển in hoa trước khi kiểm
    ["INV {NNN}", "NEVER", "BAD_CHARS"],
    ["INV{YY}", "NEVER", "NO_SEQ"],
    ["{NNN}-{NNN}", "NEVER", "MANY_SEQ"],
    ["INV{NNN}", "YEAR", "RESET_NEEDS_DATE"],
    ["INV{YY}{NNN}", "MONTH", "RESET_NEEDS_DATE"],
    ["INV{YYYY}{NNN}", "YEAR", null],
    ["ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{NNN}", "NEVER", "TOO_LONG"],
  ] as const)("%s / %s → %s", (p, reset, issue) => {
    expect(patternIssue(p.toUpperCase(), reset)).toBe(issue);
  });
  it("schema chuyển in hoa và báo lỗi ở pattern", () => {
    expect(InvoiceNumberingSchema.parse({ pattern: " inv{yy}{mm}-{nnn} ", reset: "MONTH" }).pattern).toBe("INV{YY}{MM}-{NNN}");
    const r = InvoiceNumberingSchema.safeParse({ pattern: "INV{NNN}", reset: "MONTH" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["pattern"]);
  });
  it("kỳ bộ đếm theo cách đánh lại", () => {
    expect(periodKey("MONTH", "2026-11-12")).toBe("2611");
    expect(periodKey("YEAR", "2026-11-12")).toBe("2026");
    expect(periodKey("NEVER", "2026-11-12")).toBe("ALL");
  });
});

describe("mẫu in hóa đơn", () => {
  it("mẫu dựng sẵn hợp lệ", () => {
    expect(InvoiceLayoutSchema.parse(DEFAULT_INVOICE_LAYOUT)).toEqual(DEFAULT_INVOICE_LAYOUT);
  });
  it("không tắt được nhóm bắt buộc, không thiếu/trùng nhóm", () => {
    const off = { ...DEFAULT_INVOICE_LAYOUT, blocks: DEFAULT_INVOICE_LAYOUT.blocks.map((b) => (b.key === "BUYER" ? { ...b, visible: false } : b)) };
    expect(InvoiceLayoutSchema.safeParse(off).success).toBe(false);
    expect(InvoiceLayoutSchema.safeParse({ ...DEFAULT_INVOICE_LAYOUT, blocks: DEFAULT_INVOICE_LAYOUT.blocks.slice(1) }).success).toBe(false);
    const cols = [...DEFAULT_INVOICE_LAYOUT.columns, DEFAULT_INVOICE_LAYOUT.columns[0]!];
    expect(InvoiceLayoutSchema.safeParse({ ...DEFAULT_INVOICE_LAYOUT, columns: cols }).success).toBe(false);
  });
  it("tiêu đề không được là Proforma (ISBP 821 mục C)", () => {
    expect(InvoiceLayoutSchema.safeParse({ ...DEFAULT_INVOICE_LAYOUT, title: "PROFORMA INVOICE" }).success).toBe(false);
  });
});

describe("InvoiceLayoutSchema.itemCodeSet / ảnh chụp in theo bộ mã", () => {
  it("itemCodeSet: mặc định null; nhận { codeSetId } hoặc { kind: ITEM_NO }; từ chối dạng khác", () => {
    const base = { ...DEFAULT_INVOICE_LAYOUT };
    const { itemCodeSet: _omit, ...noField } = base;
    expect(InvoiceLayoutSchema.parse(noField).itemCodeSet).toBeNull();
    expect(InvoiceLayoutSchema.parse({ ...base, itemCodeSet: { codeSetId: "cst_1" } }).itemCodeSet).toEqual({ codeSetId: "cst_1" });
    expect(InvoiceLayoutSchema.parse({ ...base, itemCodeSet: { kind: "ITEM_NO" } }).itemCodeSet).toEqual({ kind: "ITEM_NO" });
    expect(InvoiceLayoutSchema.safeParse({ ...base, itemCodeSet: { kind: "ACCOUNTING" } }).success).toBe(false);
  });
});
