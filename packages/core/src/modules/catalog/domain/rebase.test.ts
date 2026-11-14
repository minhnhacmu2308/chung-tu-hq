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
  it("tỷ lệ ĐVT 2 đổi theo gốc mới: cũ × f (9 số lẻ); ĐVT 2 = gốc mới → 1; không có ĐVT 2 → không có qty2Factor", () => {
    // 1 PCE = 0.25 KGM; gốc PCE → BOX (1 BOX = 12 PCE) → 1 BOX = 3 KGM.
    expect(planRebase({ baseUnit: "PCE", newBase: "BOX", conversions: [{ unit: "BOX", factor: "12" }], qty2: { unit: "KGM", factor: "0.250000000" } })).toMatchObject({
      kind: "REBASE", qty2Factor: { oldValue: "0.25", newValue: "3" },
    });
    expect(planRebase({ baseUnit: "PCE", newBase: "BOX", conversions: [], factor: "3", qty2: { unit: "KGM", factor: "0.3333333333" } })).toMatchObject({ qty2Factor: { newValue: "1" } });
    expect(planRebase({ baseUnit: "PCE", newBase: "BOX", conversions: [], factor: "12", qty2: { unit: "box", factor: "0.083333333" } })).toMatchObject({ qty2Factor: { oldValue: "0.083333333", newValue: "1" } });
    expect(planRebase({ baseUnit: "PCE", newBase: "BOX", conversions: [], factor: "12", qty2: { unit: "PCE", factor: "1" } })).toMatchObject({ qty2Factor: { oldValue: "1", newValue: "12" } });
    expect(planRebase({ baseUnit: "PCE", newBase: "BOX", conversions: [], factor: "12" })).not.toHaveProperty("qty2Factor");
  });
  it("đổi gốc rồi đổi ngược cho lại hệ số cũ (trong làm tròn)", () => {
    const a = planRebase({ baseUnit: "KGM", newBase: "TAN", conversions: [{ unit: "TAN", factor: "1000" }, { unit: "BAO", factor: "50" }] });
    if (a.kind !== "REBASE") throw new Error("expected REBASE");
    const b = planRebase({ baseUnit: "TAN", newBase: "KGM", conversions: a.conversions });
    expect(b).toMatchObject({ kind: "REBASE", conversions: [{ unit: "BAO", factor: "50" }, { unit: "TAN", factor: "1000" }] });
  });
});

describe("diffItemFields – thông tin mặt hàng từ bộ nguồn gốc", () => {
  const item = { name: "Vải", hsCode: "52081100", kind: "GOODS" as const, origin: null, tariffSchedule: null, importDutyRate: "5.0000", vatRate: null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null, qty2Unit: null, qty2Factor: null, description: null, note: null };
  it("ĐVT 2 + tỷ lệ: tỷ lệ so theo giá trị (numeric(24,9)), giá trị cũ ghi gọn", () => {
    const withQ2 = { ...item, qty2Unit: "KGM", qty2Factor: "0.250000000" };
    expect(diffItemFields(withQ2, { qty2Unit: "KGM", qty2Factor: "0.25" })).toEqual({ patch: {}, changes: [] });
    expect(diffItemFields(withQ2, { qty2Factor: "0.3" }).changes).toEqual([{ key: "qty2Factor", oldValue: "0.25", newValue: "0.3" }]);
    expect(diffItemFields(item, { qty2Unit: "KGM", qty2Factor: "0.25" }).patch).toEqual({ qty2Unit: "KGM", qty2Factor: "0.25" });
  });
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
