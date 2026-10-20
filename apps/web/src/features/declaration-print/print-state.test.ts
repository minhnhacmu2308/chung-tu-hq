import { expandPrintRow, layoutFor, otherFieldKeys, printKeys, printLayoutFor } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { attentionCells, cellState, editedKeys, errorSlots, estimateValues, fieldLocator, NOT_ISSUED, otherFieldCells, otherFieldGroups, nextTarget, pageCount, panelOrder, keepTogetherValue, printAttention, printCode, printIssues, printValue, sameNumber, unplacedErrors, type PrintData } from "./print-state";

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
  it("so sánh số Hải quan (định dạng VN) với DecimalString của ứng dụng", () => {
    expect(sameNumber("886.187.500", "886187500")).toBe(true);
    expect(sameNumber("25780", "25780.00")).toBe(true);
    expect(sameNumber("170,125", "170.125000")).toBe(true);
    expect(sameNumber("0,125", "0.125000")).toBe(true);
    expect(sameNumber("1.500", "1500")).toBe(true);
    expect(sameNumber("1.500", "1.5")).toBe(true);
    expect(sameNumber("1.234.567,89", "1234567.89")).toBe(true);
    expect(sameNumber("2", "1")).toBe(false);
    expect(sameNumber("1", "2")).toBe(false);
    expect(sameNumber("", "0")).toBe(false);
    expect(sameNumber("0", "")).toBe(false);
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
  it("ô đầu trang trùng ô tab Hải quan giữ nhóm của tab", () => {
    expect(fieldLocator("IDA").get("TK_A09")!.group.map((f) => f.key)).toContain("TK_AD11");
  });
});

describe("errorSlots", () => {
  it("mọi ô của chỉ tiêu lỗi, theo thứ tự nhảy", () => {
    const loc = fieldLocator("IDA");
    const expected = [...loc.values()].filter((s) => s.scope === "decl" && (s.field.no ?? s.parentNo) === "1.22").map((s) => s.field.key);
    const slots = errorSlots("IDA", [{ no: "1.22", code: "E1", message: "x" }], []);
    expect(slots.map((s) => s.key).sort()).toEqual([...expected].sort());
    expect(slots.map((s) => s.key)).toEqual(["TK_EPA", "TK_EP2", "TK_EP3", "TK_EP4"]);
    expect(slots.every((s) => s.line === undefined)).toBe(true);
  });
  it("lỗi dòng hàng → ô dòng hàng với chỉ số 0-based; dòng lạ bỏ qua", () => {
    expect(errorSlots("IDA", [{ no: "1.74", line: 7, code: "E1", message: "x" }], [3, 7])).toEqual([{ key: "HAG_CMD", line: 1 }]);
    expect(errorSlots("IDA", [{ no: "1.74", line: 9, code: "E1", message: "x" }], [3, 7])).toEqual([]);
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

describe("printValue", () => {
  const field = (key: string) => fieldLocator("IDA").get(key)!.field;
  it("rỗng → chuỗi rỗng, ô ngày rỗng → / /", () => {
    expect(printValue(field("TK_IMN"), undefined)).toBe("");
    expect(printValue(field("TK_IMN"), "  ")).toBe("");
    expect(printValue(field("TK_A09"), "")).toBe("/ /");
    expect(printValue(undefined, undefined)).toBe("");
  });
  it("số tờ khai rỗng → Chưa cấp (IDA TK_ICN, EDA TK_ECN); có số → giữ số", () => {
    expect(printValue(field("TK_ICN"), "")).toBe(NOT_ISSUED);
    expect(NOT_ISSUED).toBe("Chưa cấp");
    expect(printValue(fieldLocator("EDA").get("TK_ECN")!.field, undefined)).toBe("Chưa cấp");
    expect(printValue(field("TK_ICN"), "107000000001")).toBe("107000000001");
  });
  it("ô mã có danh mục → mã + tên", () => {
    const v = printValue(field("TK_MTC"), "2");
    expect(v.startsWith("2\u00a0 ")).toBe(true);
    expect(v.length).toBeGreaterThan(3);
  });
  it("mã không có trong danh mục / ô thường → giữ giá trị", () => {
    expect(printValue(field("TK_CH"), "ZZZZ")).toBe("ZZZZ");
    expect(printValue(field("TK_IMN"), "CONG TY A")).toBe("CONG TY A");
  });
});

describe("otherFieldCells", () => {
  it("chỉ ô đang áp dụng, mỗi dòng hàng một danh sách", () => {
    const out = otherFieldCells("IDA", {}, [{}, {}]);
    expect(out.items).toHaveLength(2);
    const loc = fieldLocator("IDA");
    for (const k of out.decl) expect(loc.get(k)?.scope).toBe("decl");
    for (const k of out.items[0]!) expect(loc.get(k)?.scope).toBe("item");
  });
});

describe("otherFieldGroups", () => {
  it.each(["IDA", "EDA"] as const)("%s: nhóm theo khối Phụ lục II, đủ và đúng thứ tự ô của otherFieldCells", (kind) => {
    const items = [{}, {}];
    const cells = otherFieldCells(kind, {}, items);
    const groups = otherFieldGroups(kind, {}, items);
    expect(groups.decl.flatMap((g) => g.keys).sort()).toEqual([...cells.decl].sort());
    expect(groups.items).toHaveLength(2);
    groups.items.forEach((gs, i) => expect(gs.flatMap((g) => g.keys).sort()).toEqual([...cells.items[i]!].sort()));
    for (const g of [...groups.decl, ...groups.items.flat()]) {
      expect(g.keys.length).toBeGreaterThan(0);
      expect(g.title.length).toBeGreaterThan(0);
    }
  });
  it("tiêu đề nhóm = tiêu đề khối của layoutFor, theo thứ tự khối", () => {
    const groups = otherFieldGroups("IDA", {}, []);
    const blocks = layoutFor("IDA").declarant.flatMap((s) => s.blocks);
    const order = groups.decl.map((g) => blocks.findIndex((b) => b.id === g.id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const g of groups.decl) expect(g.title).toBe(blocks.find((b) => b.id === g.id)!.title);
  });
});

describe("panelOrder", () => {
  it("thứ tự in (đầu trang trước), dòng hàng theo thứ tự, cuối là Chỉ tiêu khác", () => {
    const order = panelOrder("IDA", 2);
    const firstHeader = expandPrintRow(printLayoutFor("IDA").header[0]!).flat()[0]!.key;
    expect(order[0]).toEqual({ key: firstHeader });
    const at = (line: number) => order.findIndex((t) => t.key === "HAG_CMD" && t.line === line);
    expect(at(0)).toBeGreaterThanOrEqual(0);
    expect(at(1)).toBeGreaterThan(at(0));
    const other = otherFieldKeys("IDA");
    const lastKey = other.item.length > 0 ? other.item[other.item.length - 1]! : other.decl[other.decl.length - 1]!;
    expect(order[order.length - 1]!.key).toBe(lastKey);
  });
});

describe("nextTarget", () => {
  const order = panelOrder("IDA", 1);
  const loc = fieldLocator("IDA");
  // Nhóm ô tờ khai có ít nhất 3 ô liền nhau trong thứ tự (vd địa chỉ) – lấy ô giữa.
  const start = order.findIndex((t, i) => {
    const g = loc.get(t.key)!.group;
    return t.line === undefined && g.length >= 3 && g[0]!.key === t.key && g.every((f, j) => order[i + j]?.key === f.key);
  });
  const group = loc.get(order[start]!.key)!.group.map((f) => f.key);
  const middle = order[start + 1]!;

  it("Tab từ một ô trong nhóm → ô đầu tiên sau cả nhóm", () => {
    expect(nextTarget(order, middle, group, 1)).toEqual(order[start + group.length]);
  });
  it("Shift+Tab → ô ngay trước nhóm", () => {
    expect(start).toBeGreaterThan(0);
    expect(nextTarget(order, middle, group, -1)).toEqual(order[start - 1]);
  });
  it("ô dòng hàng: chỉ bỏ ô cùng nhóm cùng dòng; quay vòng ở cuối", () => {
    const last = order[order.length - 1]!;
    expect(nextTarget(order, last, [last.key], 1)).toEqual(order[0]);
    expect(nextTarget([], last, [last.key], 1)).toBeUndefined();
  });
});

describe("printAttention (Fix round 1)", () => {
  const data = (errors: Parameters<typeof attentionCells>[3] = []): PrintData => ({
    kind: "IDA", lineNos: [1], values: {}, itemRows: [{}], errors, customs: {}, estimate: {}, estimated: new Set(),
  });
  it("sửa được → lỗi và ô còn thiếu, như attentionCells", () => {
    const d = data([{ no: "1.22", code: "E1", message: "x" }]);
    expect(printAttention(d, "FULL", true)).toEqual(attentionCells("IDA", {}, [{}], d.errors, [1]));
    expect(printAttention(d, "FULL", true).some((c) => c.reason === "MISSING")).toBe(true);
  });
  it("chỉ đọc (LOCKED hoặc không có quyền sửa) → bỏ ô còn thiếu, giữ ô lỗi Hải quan", () => {
    const d = data([{ no: "1.22", code: "E1", message: "x" }]);
    for (const cells of [printAttention(d, "LOCKED", true), printAttention(d, "FULL", false)]) {
      expect(cells).toEqual([{ key: "TK_EPA", reason: "ERROR" }]);
    }
    expect(printAttention(data(), "LOCKED", true)).toEqual([]);
  });
});

describe("printCode", () => {
  const loc = fieldLocator("IDA");
  it("ô mã có tên (bảng mã / 'mã · nghĩa' / lựa chọn) → chỉ mã", () => {
    expect(printCode(loc.get("TK_A06")!.field, "2")).toBe("2");
    expect(printValue(loc.get("TK_A06")!.field, "2")).not.toBe("2");
    const withOptions = [...loc.values()].find((s) => s.field.options?.length)!.field;
    const opt = withOptions.options![0]!.value;
    expect(printCode(withOptions, opt)).toBe(opt);
    const withTable = [...loc.values()].find((s) => s.field.codeTable && printValue(s.field, "VN") !== "VN");
    if (withTable) expect(printCode(withTable.field, "VN")).toBe("VN");
  });
  it("ô thường, ngày, rỗng → null", () => {
    expect(printCode(loc.get("TK_IMN")?.field, "CÔNG TY A")).toBeNull();
    expect(printCode({ key: "X", input: "date" }, "2026-10-19")).toBeNull();
    expect(printCode(loc.get("TK_A06")!.field, "")).toBeNull();
    expect(printCode(undefined, "2")).toBeNull();
  });
});

describe("keepTogetherValue (Fix round 2)", () => {
  it("ngày, giờ, mã và số định danh không giới hạn độ dài → không bẻ giữa cụm", () => {
    for (const v of ["18/10/2026", "00:02:17", "08:30", "107621548840", "COSU6402215870", "E21", "VNHPH"]) expect(keepTogetherValue(v), v).toBe(true);
    expect(keepTogetherValue("2026-10-18", "date")).toBe(true);
  });
  it("số tiền, chữ có khoảng trắng, rỗng → không", () => {
    for (const v of ["1.244.609.250", "46.215,00", "CÔNG TY A", "", "  "]) expect(keepTogetherValue(v), v).toBe(false);
  });
});

describe("unplacedErrors / printIssues (final review)", () => {
  const base = (errors: Parameters<typeof attentionCells>[3]): PrintData => ({
    kind: "IDA", lineNos: [1], values: {}, itemRows: [{}], errors, customs: {}, estimate: {}, estimated: new Set(),
  });
  const noNo = { code: "E9", message: "Lỗi chung" };
  const badLine = { no: "1.74", line: 9, code: "E8", message: "Dòng không có" };
  const placed = { no: "1.22", code: "E1", message: "x" };
  it("lỗi không có số chỉ tiêu / dòng hàng không có → không gắn được vào ô", () => {
    expect(unplacedErrors("IDA", [noNo, badLine, placed], [1])).toEqual([noNo, badLine]);
  });
  it("được đếm cùng ô cần xử lý (huy hiệu + thanh công cụ), cả khi tờ khai chỉ đọc", () => {
    const d = base([noNo, badLine, placed]);
    const locked = printIssues(d, "LOCKED", true);
    expect(locked.unplaced).toEqual([noNo, badLine]);
    expect(locked.cells).toEqual([{ key: "TK_EPA", reason: "ERROR" }]);
    expect(locked.count).toBe(3);
    const open = printIssues(d, "FULL", true);
    expect(open.count).toBe(open.cells.length + 2);
  });
});
