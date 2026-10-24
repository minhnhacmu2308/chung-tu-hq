import type { Shipment } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import type { DossierProfile } from "../../helpers.js";
import { anphatExport, hansol, item, NK_SEA, ORG, XK_SEA } from "../../test/shipments.js";
import { ruleByCode } from "../index.js";

const run = (code: string, s: Shipment, dossier?: DossierProfile) => ruleByCode(code)!.run(s, dossier ? { org: ORG, dossier } : { org: ORG });
const manyLines = (n: number) => Array.from({ length: n }, (_, k) => item(k + 1, `Vòng bi ${k + 1}`, "10", "PCE", "1.5", "15", "KR", null));

describe("R-MAX-50-LINES (INFO)", () => {
  it("PASS khi 7 dòng", () => expect(run("R-MAX-50-LINES", hansol()).result).toBe("PASS"));
  it("120 dòng: thông báo INFO/PASS, khai 3 tờ (50/50/20)", () => {
    const r = run("R-MAX-50-LINES", hansol((s) => (s.items = manyLines(120))));
    expect(ruleByCode("R-MAX-50-LINES")!.severity).toBe("INFO");
    expect(r.result).toBe("PASS");
    expect(r.detail).toBe("Lô hàng có 120 dòng hàng – sẽ khai 3 tờ khai (50/50/20)");
  });
  it("SKIPPED khi chưa có dòng hàng", () => expect(run("R-MAX-50-LINES", hansol((s) => (s.items = []))).result).toBe("SKIPPED"));
  it("biên: đúng 50 dòng trong giới hạn, 51 dòng khai 2 tờ (50/1)", () => {
    const r50 = run("R-MAX-50-LINES", hansol((s) => (s.items = manyLines(50))));
    expect(r50.result).toBe("PASS");
    expect(r50.detail).toMatch(/trong giới hạn/);
    const r = run("R-MAX-50-LINES", hansol((s) => (s.items = manyLines(51))));
    expect(r.result).toBe("PASS");
    expect(r.detail).toBe("Lô hàng có 51 dòng hàng – sẽ khai 2 tờ khai (50/1)");
  });
});

describe("R-BRANCH-COUNT-LOCKED (BLOCKER)", () => {
  const runB = (n: number, issuedBranches: number) => ruleByCode("R-BRANCH-COUNT-LOCKED")!.run(hansol((s) => (s.items = manyLines(n))), { org: ORG, issuedBranches });
  it("là BLOCKER", () => expect(ruleByCode("R-BRANCH-COUNT-LOCKED")!.severity).toBe("BLOCKER"));
  it("FAIL khi đã có số 3 tờ nhưng lô còn 2 tờ", () => {
    const r = runB(95, 3);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toBe("Đã có số tờ khai cho 3 tờ nhưng lô hàng nay chỉ còn 2 tờ (95 dòng) – hủy tờ khai thừa trước khi truyền");
  });
  it("FAIL khi đã có số 2 tờ nhưng lô nay cần 3 tờ", () => {
    const r = runB(120, 2);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toBe("Đã có số tờ khai cho 2 tờ nhưng lô hàng nay cần 3 tờ (120 dòng) – hủy tờ khai đã cấp số rồi khai lại trước khi truyền");
  });
  it("SKIPPED khi chưa có tờ nào được cấp số", () => expect(runB(120, 0).result).toBe("SKIPPED"));
  it("SKIPPED khi không truyền issuedBranches", () => expect(ruleByCode("R-BRANCH-COUNT-LOCKED")!.run(hansol(), { org: ORG }).result).toBe("SKIPPED"));
  it("PASS khi số tờ bằng nhau", () => expect(runB(120, 3).result).toBe("PASS"));
});

describe("R-LINE-AMOUNT (WARNING)", () => {
  it("PASS khi mọi dòng đơn giá × số lượng = trị giá", () => {
    const r = run("R-LINE-AMOUNT", hansol());
    expect(r.result).toBe("PASS");
    expect(r.detail).toMatch(/^7 dòng/);
  });
  it("WARN nêu số cụ thể: Dòng 3: 400 × 6,75 = 2.700 ≠ 2.760", () => {
    const r = run("R-LINE-AMOUNT", hansol((s) => (s.items[2]!.amount.value = "2760")));
    expect(r.result).toBe("WARN");
    expect(r.detail).toContain("Dòng 3: 400 × 6,75 = 2.700 ≠ 2.760");
    expect(r.fields).toEqual(["/items/2/amount"]);
  });
  it("SKIPPED khi không dòng nào đủ số lượng, đơn giá, trị giá", () => expect(run("R-LINE-AMOUNT", hansol((s) => s.items.forEach((i) => (i.unitPrice.value = null)))).result).toBe("SKIPPED"));
  it("biên: lệch đúng 1 PASS (±1), lệch 1,01 WARN", () => {
    expect(run("R-LINE-AMOUNT", hansol((s) => (s.items[0]!.amount.value = "3701"))).result).toBe("PASS");
    expect(run("R-LINE-AMOUNT", hansol((s) => (s.items[0]!.amount.value = "3701.01"))).result).toBe("WARN");
  });
  it("biên: hơn 5 dòng lệch → liệt kê 5 dòng + 'n dòng khác', fields đủ mọi dòng", () => {
    const r = run("R-LINE-AMOUNT", hansol((s) => s.items.forEach((i) => (i.amount.value = "1"))));
    expect(r.detail).toMatch(/\+ 2 dòng khác$/);
    expect(r.fields).toHaveLength(7);
  });
});

describe("R-QTY-DECIMALS (WARNING)", () => {
  it("PASS khi số lượng nguyên", () => expect(run("R-QTY-DECIMALS", hansol()).result).toBe("PASS"));
  it("WARN khi 12,345 (3 chữ số thập phân) – nhắc mô tả#&số lượng", () => {
    const r = run("R-QTY-DECIMALS", hansol((s) => (s.items[1]!.quantity.value = "12.345")));
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/^Dòng 2: 12,345 – Số lượng chỉ khai tối đa 2 chữ số thập phân/);
    expect(r.detail).toContain("'mô tả#&số lượng thực tế'");
    expect(r.fields).toEqual(["/items/1/quantity"]);
  });
  it("SKIPPED khi không có số lượng", () => expect(run("R-QTY-DECIMALS", hansol((s) => s.items.forEach((i) => (i.quantity.value = null)))).result).toBe("SKIPPED"));
  it("biên: 12.500 (số 0 cuối) và 12.25 vẫn PASS", () => {
    expect(run("R-QTY-DECIMALS", hansol((s) => (s.items[0]!.quantity.value = "12.500"))).result).toBe("PASS");
    expect(run("R-QTY-DECIMALS", hansol((s) => (s.items[0]!.quantity.value = "12.25"))).result).toBe("PASS");
  });
});

describe("R-LINE-VALUE-DIGITS (BLOCKER)", () => {
  it("PASS khi trị giá dòng nhỏ", () => expect(run("R-LINE-VALUE-DIGITS", hansol()).result).toBe("PASS"));
  it("FAIL khi trị giá 13 chữ số phần nguyên → tách dòng hàng", () => {
    const r = run("R-LINE-VALUE-DIGITS", hansol((s) => (s.items[0]!.amount.value = "1234567890123")));
    expect(r.result).toBe("FAIL");
    expect(r.detail).toContain("Dòng 1: 1.234.567.890.123 (13 chữ số)");
    expect(r.detail).toContain("tách dòng hàng");
    expect(r.fields).toEqual(["/items/0/amount"]);
  });
  it("SKIPPED khi không có trị giá dòng", () => expect(run("R-LINE-VALUE-DIGITS", hansol((s) => s.items.forEach((i) => (i.amount.value = null)))).result).toBe("SKIPPED"));
  it("biên: 999.999.999.999,9999 (12 chữ số + 4 thập phân) PASS", () => expect(run("R-LINE-VALUE-DIGITS", hansol((s) => (s.items[0]!.amount.value = "999999999999.9999"))).result).toBe("PASS"));
});

describe("R-DESCRIPTION-LENGTH (WARNING)", () => {
  const long = (n: number) => "Ổ".repeat(n);
  it("PASS khi mô tả ngắn", () => expect(run("R-DESCRIPTION-LENGTH", hansol(), NK_SEA).result).toBe("PASS"));
  it("WARN khi mô tả 215 ký tự, liệt kê dòng", () => {
    const r = run("R-DESCRIPTION-LENGTH", hansol((s) => (s.items[3]!.description.value = long(215))), NK_SEA);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/^Dòng 4: 215 ký tự – mô tả hàng hóa tối đa 200 ký tự/);
    expect(r.fields).toEqual(["/items/3/description"]);
  });
  it("SKIPPED khi không có mô tả", () => expect(run("R-DESCRIPTION-LENGTH", hansol((s) => s.items.forEach((i) => (i.description.value = null)))).result).toBe("SKIPPED"));
  it("biên: 198 ký tự PASS cho NK (và khi chưa có hồ sơ) nhưng WARN cho XK (196 vì #&XX); chữ có dấu tính 1 ký tự", () => {
    const set = (s: Shipment) => (s.items[0]!.description.value = long(198));
    expect(run("R-DESCRIPTION-LENGTH", hansol(set), NK_SEA).result).toBe("PASS");
    expect(run("R-DESCRIPTION-LENGTH", hansol(set)).result).toBe("PASS");
    const r = run("R-DESCRIPTION-LENGTH", anphatExport(set), XK_SEA);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/196 ký tự/);
  });
});
