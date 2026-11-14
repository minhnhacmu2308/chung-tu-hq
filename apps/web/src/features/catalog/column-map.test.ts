import { describe, expect, it } from "vitest";
import { assignColumn, effectiveColumnMap, ignoredFields, missingRequired, recallColumnMap, saveColumnMap } from "./column-map";
import { toImportRows } from "./read-xlsx";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("ghép cột – logic thuần", () => {
  it("mỗi trường một cột, mỗi cột một trường; Bỏ qua gỡ trường khỏi cột", () => {
    let map = assignColumn({}, 0, "code");
    map = assignColumn(map, 1, "name");
    expect(map).toEqual({ code: 0, name: 1 });
    // Gán "code" cho cột 2 → rời cột 0.
    expect(assignColumn(map, 2, "code")).toEqual({ code: 2, name: 1 });
    // Cột 1 đổi sang "unit" → "name" bỏ ghép.
    expect(assignColumn(map, 1, "unit")).toEqual({ code: 0, unit: 1 });
    expect(assignColumn(map, 0, "")).toEqual({ name: 1 });
    expect(missingRequired({ name: 1 })).toEqual(["code"]);
  });

  it("bộ không phải nguồn gốc: bỏ trường thông tin mặt hàng khỏi ghép cột gửi đi + liệt kê cột bị bỏ", () => {
    const map = { code: 0, name: 1, linkCode: 2, origin: 3, vatRate: 4, note: 5 };
    expect(effectiveColumnMap(map, true)).toBe(map);
    expect(effectiveColumnMap(map, false)).toEqual({ code: 0, name: 1, linkCode: 2 });
    expect(ignoredFields(map, false)).toEqual(["origin", "vatRate", "note"]);
    expect(ignoredFields(map, true)).toEqual([]);
  });

  it("nhớ ghép cột theo bộ mã và tiêu đề cột (file sau đổi thứ tự cột; cột đã chọn Bỏ qua không đoán lại)", () => {
    const store = memory();
    saveColumnMap("cst_a", ["Mã", "Tên", "Người lập", "Ghi chú"], { code: 0, name: 1, description: 2 }, store);
    // File mới: cột đổi chỗ; "Ghi chú" lần trước Bỏ qua → không tự gán "note" dù đoán được.
    const r = recallColumnMap("cst_a", ["Ghi chú", "Người lập", "Tên", "Mã", "ĐVT"], { note: 0, name: 2, code: 3, unit: 4 }, store);
    expect(r).toEqual({ map: { description: 1, name: 2, code: 3, unit: 4 }, remembered: true });
    // Bộ khác → chỉ theo đoán.
    expect(recallColumnMap("cst_b", ["Mã"], { code: 0 }, store)).toEqual({ map: { code: 0 }, remembered: false });
  });

  it("đọc dòng theo ghép cột cho mọi trường (Mã nối, loại, thuế…)", () => {
    const rows = toImportRows({ rows: [["A1", "Bu lông", "MH-000001", "Nguyên liệu", "CN", "5", ""]] }, { code: 0, name: 1, linkCode: 2, kind: 3, origin: 4, importDutyRate: 5, note: 6 });
    expect(rows).toEqual([{ code: "A1", name: "Bu lông", linkCode: "MH-000001", kind: "Nguyên liệu", origin: "CN", importDutyRate: "5" }]);
  });
});
