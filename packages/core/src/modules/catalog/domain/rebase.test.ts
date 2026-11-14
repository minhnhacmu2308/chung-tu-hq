import { describe, expect, it } from "vitest";
import { diffItemFields, planRebase } from "./rebase.js";

describe("planRebase – đổi ĐVT gốc (spec 2026-11-14 §2)", () => {
  it("gốc KGM → TAN (1 TAN = 1000 KGM): quy đổi khác chia f, thêm KGM = 1/f, bỏ dòng TAN", () => {
    const p = planRebase({ baseUnit: "KGM", newBase: "TAN", conversions: [{ unit: "TAN", factor: "1000" }, { unit: "BAO", factor: "50" }] });
    expect(p).toEqual({
      kind: "REBASE",
      factor: "1000",
      conversions: [{ unit: "BAO", factor: "0.05" }, { unit: "KGM", factor: "0.001" }],
      changes: [
        { unit: "BAO", oldValue: "50", newValue: "0.05" },
        { unit: "KGM", oldValue: "", newValue: "0.001" },
        { unit: "TAN", oldValue: "1000", newValue: "" },
      ],
      lineFactors: [],
    });
  });
  it("làm tròn 9 chữ số thập phân, ROUND_HALF_UP; hệ số theo lô chia f", () => {
    const p = planRebase({ baseUnit: "PCE", newBase: "BOX", conversions: [{ unit: "BOX", factor: "3" }], lineFactors: [{ id: "l1", factor: "2" }, { id: "l2", factor: "3.6" }] });
    expect(p).toMatchObject({
      kind: "REBASE",
      conversions: [{ unit: "PCE", factor: "0.333333333" }],
      lineFactors: [{ id: "l1", oldValue: "2", newValue: "0.666666667" }, { id: "l2", oldValue: "3.6", newValue: "1.2" }],
    });
  });
  it("hệ số truyền vào thắng khi chưa có quy đổi của gốc mới; so ĐVT không phân biệt hoa thường/khoảng trắng", () => {
    const p = planRebase({ baseUnit: "pce", newBase: " Box ", conversions: [], factor: "12" });
    expect(p).toMatchObject({ kind: "REBASE", factor: "12", conversions: [{ unit: "pce", factor: "0.083333333" }] });
  });
  it("cùng gốc → SAME; chưa có gốc → SET_BASE; thiếu hệ số → NO_FACTOR; kết quả tròn về 0 → NO_FACTOR", () => {
    expect(planRebase({ baseUnit: "KGM", newBase: "kgm", conversions: [] })).toEqual({ kind: "SAME" });
    expect(planRebase({ baseUnit: null, newBase: "KGM", conversions: [] })).toEqual({ kind: "SET_BASE" });
    expect(planRebase({ baseUnit: "KGM", newBase: "TAN", conversions: [{ unit: "BAO", factor: "50" }] })).toEqual({ kind: "NO_FACTOR" });
    expect(planRebase({ baseUnit: "KGM", newBase: "TAN", conversions: [], factor: "0" })).toEqual({ kind: "NO_FACTOR" });
    expect(planRebase({ baseUnit: "MGM", newBase: "TAN", conversions: [], factor: "100000000000" })).toEqual({ kind: "NO_FACTOR" });
  });
  it("đổi gốc rồi đổi ngược cho lại hệ số cũ (trong làm tròn)", () => {
    const a = planRebase({ baseUnit: "KGM", newBase: "TAN", conversions: [{ unit: "TAN", factor: "1000" }, { unit: "BAO", factor: "50" }] });
    if (a.kind !== "REBASE") throw new Error("expected REBASE");
    const b = planRebase({ baseUnit: "TAN", newBase: "KGM", conversions: a.conversions });
    expect(b).toMatchObject({ kind: "REBASE", conversions: [{ unit: "BAO", factor: "50" }, { unit: "TAN", factor: "1000" }] });
  });
});

describe("diffItemFields – thông tin mặt hàng từ bộ nguồn gốc", () => {
  const item = { name: "Vải", hsCode: "52081100", kind: "GOODS" as const, origin: null, tariffSchedule: null, importDutyRate: "5.0000", vatRate: null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null, description: null, note: null };
  it("chỉ trường có giá trị và khác hiện tại; thuế suất so theo giá trị số", () => {
    const d = diffItemFields(item, { name: "Vải cotton", hsCode: "52081100", kind: "MATERIAL", importDutyRate: "5", vatRate: "8" });
    expect(d.patch).toEqual({ name: "Vải cotton", kind: "MATERIAL", vatRate: "8" });
    expect(d.changes).toEqual([
      { key: "name", oldValue: "Vải", newValue: "Vải cotton" },
      { key: "kind", oldValue: "GOODS", newValue: "MATERIAL" },
      { key: "vatRate", oldValue: "", newValue: "8" },
    ]);
  });
  it("không có gì → patch rỗng", () => {
    expect(diffItemFields(item, {})).toEqual({ patch: {}, changes: [] });
  });
});
