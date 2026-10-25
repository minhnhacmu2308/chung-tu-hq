import { describe, expect, it } from "vitest";
import { hasAlias, normalizeAlias, pickExamples, sameSupplier, supplierSkillName } from "../learning.js";

describe("skill learning domain", () => {
  it("sameSupplier: bỏ từ chung của tên công ty; tên ngắn nằm trong tên dài", () => {
    expect(sameSupplier("HANSOL PRECISION CO., LTD.", "Hansol Precision")).toBe(true);
    expect(sameSupplier("Công ty TNHH Minh Phát", "MINH PHAT")).toBe(true);
    expect(sameSupplier("ACME CO., LTD", "ZETA CO., LTD")).toBe(false);
    expect(sameSupplier("CO., LTD", "ACME CO., LTD")).toBe(false);
    expect(sameSupplier(null, "ACME")).toBe(false);
  });

  it("normalizeAlias: bỏ dấu hai chấm/gạch thừa, phải có chữ, độ dài hợp lý", () => {
    expect(normalizeAlias("  Invoice   No.:  ")).toBe("Invoice No.");
    expect(normalizeAlias("Số HĐ -")).toBe("Số HĐ");
    expect(normalizeAlias("12345")).toBeNull();
    expect(normalizeAlias("A")).toBeNull();
  });

  it("hasAlias: so bỏ dấu và ký tự ngăn cách, kể cả tên trường", () => {
    const f = { key: "invoice_no", label: "Số hóa đơn", type: "code" as const, required: true, aliases: ["Invoice No."], extract: true, display: true };
    expect(hasAlias(f, "INVOICE NO")).toBe(true);
    expect(hasAlias(f, "so hoa don")).toBe(true);
    expect(hasAlias(f, "Ref. Inv#")).toBe(false);
  });

  it("pickExamples: mẫu cùng nhà cung cấp trước, rồi mới nhất; chỉ mẫu đã gắn nhãn", () => {
    const at = (d: number) => new Date(Date.UTC(2026, 9, d));
    const samples = [
      { id: "a", status: "LABELED", expected: {}, supplier: "ZETA", createdAt: at(5) },
      { id: "b", status: "LABELED", expected: {}, supplier: "ACME CO., LTD", createdAt: at(1) },
      { id: "c", status: "PENDING", expected: null, supplier: "ACME", createdAt: at(9) },
      { id: "d", status: "LABELED", expected: {}, supplier: null, createdAt: at(7) },
    ];
    expect(pickExamples(samples, "Acme").map((s) => s.id)).toEqual(["b", "d"]);
    expect(pickExamples(samples, null).map((s) => s.id)).toEqual(["d", "a"]);
  });

  it("supplierSkillName", () => expect(supplierSkillName("INVOICE", "ACME")).toBe("Commercial Invoice – ACME"));
});
