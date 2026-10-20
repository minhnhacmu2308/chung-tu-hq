import { otherFieldKeys, printKeys, printLayoutFor } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { attentionCells, cellState, editedKeys, estimateValues, fieldLocator, pageCount, sameNumber } from "./print-state";

describe("pageCount", () => {
  it("trang chung + dòng hàng theo số khối mỗi trang", () => {
    expect(pageCount("IDA", 0)).toBe(2);
    expect(pageCount("IDA", 2)).toBe(4);
    expect(pageCount("EDA", 2)).toBe(3);
    expect(pageCount("EDA", 3)).toBe(4);
    expect(pageCount("IDA", 50)).toBe(52);
  });
});

describe("estimateValues", () => {
  const est = { customsValueVnd: "886187500", currency: "USD", exchangeRate: "25780", taxVnd: "0", lines: 2 };
  it("IDA: điền ô Hải quan còn trống bằng số ước tính", () => {
    const { values, estimated } = estimateValues("IDA", {}, est);
    expect(values.TK_A86).toBe("886187500");
    expect(values.THUE_KJ1).toBe("USD");
    expect(values.THUE_KK1).toBe("25780");
    expect(values.THUE_B02).toBe("0");
    expect(values.TK_B12).toBe("4");
    expect(values.TK_B13).toBe("2");
    expect(estimated.has("THUE_B02")).toBe(true);
    expect(estimated.has("TK_A86")).toBe(true);
  });
  it("IDA: giữ số Hải quan đã có", () => {
    const { values, estimated } = estimateValues("IDA", { TK_A86: "900000000" }, est);
    expect(values.TK_A86).toBe("900000000");
    expect(estimated.has("TK_A86")).toBe(false);
  });
  it("không có taxVnd → không điền THUE_B02", () => {
    const { taxVnd: _t, ...noTax } = est;
    const { values, estimated } = estimateValues("IDA", {}, noTax);
    expect(values.THUE_B02).toBeUndefined();
    expect(estimated.has("THUE_B02")).toBe(false);
  });
  it("EDA: tỷ giá, số trang, số dòng", () => {
    const { values, estimated } = estimateValues("EDA", {}, { ...est, lines: 3 });
    expect(values.TK_RC1).toBe("USD");
    expect(values.TK_RD1).toBe("25780");
    expect(values.TK_K69).toBe("4");
    expect(values.TK_K70).toBe("3");
    expect([...estimated].sort()).toEqual(["TK_K69", "TK_K70", "TK_RC1", "TK_RD1"]);
  });
});

describe("sameNumber", () => {
  it("so sánh theo giá trị số", () => {
    expect(sameNumber("886187500", "886.187.500")).toBe(true);
    expect(sameNumber("25780.00", "25780")).toBe(true);
    expect(sameNumber("1", "2")).toBe(false);
    expect(sameNumber("", "0")).toBe(false);
  });
});

describe("editedKeys", () => {
  it("chỉ chỉ tiêu người dùng sửa → khóa ô", () => {
    const keys = editedKeys("IDA", [{ code: "NNK_MST", source: "USER" }, { code: "NXK_DC", source: "USER" }, { code: "NNK_TEN", source: "OCR" }]);
    expect([...keys].sort()).toEqual(["TK_EP2", "TK_EP3", "TK_EP4", "TK_EPA", "TK_IMC"]);
  });
});

describe("cellState", () => {
  it("ưu tiên error > missing > estimate > edited > none", () => {
    expect(cellState({ error: true, missing: true, estimated: true, edited: true })).toBe("error");
    expect(cellState({ error: false, missing: true, estimated: true, edited: true })).toBe("missing");
    expect(cellState({ error: false, missing: false, estimated: true, edited: true })).toBe("estimate");
    expect(cellState({ error: false, missing: false, estimated: false, edited: true })).toBe("edited");
    expect(cellState({ error: false, missing: false, estimated: false, edited: false })).toBe("none");
  });
});

describe("fieldLocator", () => {
  it("nhóm = các ô cùng dòng lặp; phạm vi dòng hàng", () => {
    const loc = fieldLocator("IDA");
    expect(loc.get("VD_BL2")!.group.map((f) => f.key)).toEqual(["VD_BL2", "APP_NGAY_VD2", "APP_HAWB2"]);
    expect(loc.get("VD_BL2")!.parentNo).toBe("1.26");
    expect(loc.get("HAG_TX3")!.scope).toBe("item");
    expect(loc.get("TK_EP2")!.group.map((f) => f.key)).toEqual(["TK_EPA", "TK_EP2", "TK_EP3", "TK_EP4"]);
    expect(loc.get("TK_IMC")!.group.map((f) => f.key)).toEqual(["TK_IMC"]);
  });
});

describe("attentionCells", () => {
  it("ô lỗi đứng trước mọi ô còn thiếu", () => {
    const cells = attentionCells("IDA", {}, [], [{ no: "1.22", code: "E1", message: "x" }], []);
    expect(cells[0]).toEqual({ key: "TK_EPA", reason: "ERROR" });
    expect(cells.slice(1).every((c) => c.reason === "MISSING")).toBe(true);
    expect(cells.length).toBeGreaterThan(1);
  });
  it("lỗi theo dòng hàng → chỉ số dòng (0-based) theo lineNos", () => {
    const cells = attentionCells("IDA", {}, [{}, {}], [{ no: "1.74", line: 2, code: "E1", message: "x" }], [1, 2]);
    expect(cells[0]).toEqual({ key: "HAG_CMD", line: 1, reason: "ERROR" });
  });
  it("lỗi có dòng không có trong lineNos, hoặc không có số chỉ tiêu → bỏ qua", () => {
    const cells = attentionCells("IDA", {}, [{}], [{ no: "1.74", line: 9, code: "E1", message: "x" }, { code: "E2", message: "y" }], [1]);
    expect(cells.some((c) => c.reason === "ERROR")).toBe(false);
  });
  it("thứ tự mỗi nhóm = thứ tự printKeys rồi 'Chỉ tiêu khác'", () => {
    const cells = attentionCells("IDA", {}, [{}], [], [1]);
    const p = printKeys(printLayoutFor("IDA"));
    const o = otherFieldKeys("IDA");
    const order = [...p.decl, ...p.item.map((k) => `0:${k}`), ...o.decl, ...o.item.map((k) => `0:${k}`)];
    const pos = cells.map((c) => order.indexOf(c.line === undefined ? c.key : `${c.line}:${c.key}`));
    expect(pos.every((x) => x >= 0)).toBe(true);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
    expect(cells.some((c) => c.line === 0)).toBe(true);
    expect(cells.some((c) => c.line === undefined)).toBe(true);
  });
  it("nhóm lặp điền một phần: dòng 2..5 trống không bị coi là thiếu", () => {
    const empty = attentionCells("IDA", {}, [], [], []);
    expect(empty.some((c) => c.key === "VD_BL1")).toBe(true);
    const partial = attentionCells("IDA", { VD_BL1: "SGN123" }, [], [], []);
    const keys = partial.map((c) => c.key);
    for (const k of ["VD_BL1", "VD_BL2", "VD_BL3", "VD_BL4", "VD_BL5"]) expect(keys).not.toContain(k);
  });
  it("không có ô Hải quan trong danh sách thiếu", () => {
    const loc = fieldLocator("IDA");
    const cells = attentionCells("IDA", {}, [{}], [], [1]);
    expect(cells.every((c) => loc.get(c.key)!.field.origin !== "CUSTOMS")).toBe(true);
  });
});
