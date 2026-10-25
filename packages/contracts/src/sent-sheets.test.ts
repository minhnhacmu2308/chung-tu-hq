import { describe, expect, it } from "vitest";
import { declarationFieldNo, isActiveSheet, sentFieldsText, sentSheetsCheck, sentSheetsReason, sentSnapshotDiff, sentSnapshotOf, SentSnapshotSchema, SNAPSHOT_VOLATILE_FIELDS, stableJson } from "./sent-sheets.js";

const base = () => ({
  fields: { CQHQ: "03CE", TK_FIC: "F", TK_BNO: "1", TK_DNO: "3", TK_TP: "100", "HANG.it1.X": "a" } as Record<string, string>,
  items: [{ id: "it2", lineNo: 2, amount: "5" }, { id: "it1", lineNo: 1, amount: "10" }],
  adjustments: [{ label: "Cước", amount: "1" }],
  containers: ["C1"],
  currency: "USD",
});

describe("stableJson", () => {
  it("khóa sắp xếp – thứ tự khóa không đổi kết quả", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(stableJson({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }));
    expect(stableJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe("sentSnapshotOf / sentSnapshotDiff", () => {
  it("common bỏ TK_FIC, TK_BNO, HANG.*; thêm @ADJ/@CONT/@CUR; lines gồm ô HANG của dòng", () => {
    const s = sentSnapshotOf(base());
    expect(Object.keys(s.common).sort()).toEqual(["@ADJ", "@CONT", "@CUR", "CQHQ", "TK_DNO", "TK_TP"]);
    expect(s.lines).toContain("HANG.it1.X");
    expect(SentSnapshotSchema.parse(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("đổi TK_FIC/TK_BNO → không khác; đổi CQHQ → common; đổi ô HANG / amount → lines", () => {
    const sent = sentSnapshotOf(base());
    const b1 = base();
    b1.fields.TK_FIC = "104000000001";
    b1.fields.TK_BNO = "2";
    expect(sentSnapshotDiff(sentSnapshotOf(b1), sent)).toEqual({ common: [], lines: false });
    const b2 = base();
    b2.fields.CQHQ = "01AB";
    b2.adjustments = [];
    expect(sentSnapshotDiff(sentSnapshotOf(b2), sent)).toEqual({ common: ["@ADJ", "CQHQ"], lines: false });
    const b3 = base();
    b3.fields["HANG.it1.X"] = "b";
    expect(sentSnapshotDiff(sentSnapshotOf(b3), sent)).toEqual({ common: [], lines: true });
    const b4 = base();
    b4.items[0]!.amount = "6";
    expect(sentSnapshotDiff(sentSnapshotOf(b4), sent)).toEqual({ common: [], lines: true });
  });
  it("ô do hệ thống tính theo đồng hồ (NGAY_DK – ngày khai dự kiến) không thuộc nội dung so sánh: dựng lại ngày khác không làm khác", () => {
    expect(SNAPSHOT_VOLATILE_FIELDS).toContain("NGAY_DK");
    const b0 = base();
    b0.fields.NGAY_DK = "2026-10-14";
    const sent = sentSnapshotOf(b0);
    expect(sent.common.NGAY_DK).toBeUndefined();
    const b1 = base();
    b1.fields.NGAY_DK = "2026-10-15";
    expect(sentSnapshotDiff(sentSnapshotOf(b1), sent)).toEqual({ common: [], lines: false });
    // Ảnh chụp cũ còn mang NGAY_DK cũng không làm khác.
    expect(sentSnapshotDiff(sentSnapshotOf(b1), { ...sent, common: { ...sent.common, NGAY_DK: "2026-10-14" } }).common).toEqual([]);
  });
  it("ô vắng và ô rỗng coi như nhau", () => {
    const sent = sentSnapshotOf(base());
    const b = base();
    b.fields.NEW = "";
    expect(sentSnapshotDiff(sentSnapshotOf(b), sent).common).toEqual([]);
  });
});

describe("isActiveSheet / sentSheetsCheck / sentSheetsReason", () => {
  it("còn hiệu lực = có số, không miễn, không chờ gửi nội dung", () => {
    expect(isActiveSheet({ stage: "PRE_DECLARED", declarationNo: "1" })).toBe(true);
    expect(isActiveSheet({ stage: "DECLARED", declarationNo: "1" })).toBe(true);
    expect(isActiveSheet({ stage: "AMEND_PRE_DECLARED", declarationNo: "1" })).toBe(true);
    for (const stage of ["RECALLED", "AMEND_RECALLED", "NOT_SENT", "CLEARED", "REJECTED", "POST_EDITING"] as const) expect(isActiveSheet({ stage, declarationNo: "1" })).toBe(false);
    expect(isActiveSheet({ stage: "PRE_DECLARED", declarationNo: null })).toBe(false);
  });
  it("tờ còn hiệu lực có sent → so; không sent (dữ liệu cũ) → unverified; tờ khác bỏ qua", () => {
    const sent = sentSnapshotOf(base());
    const changed = base();
    changed.fields.CQHQ = "X";
    const now = sentSnapshotOf(changed);
    const r = sentSheetsCheck([
      { no: 1, stage: "PRE_DECLARED", declarationNo: "1", sent, current: now },
      { no: 2, stage: "RECALLED", declarationNo: "2", sent, current: now },
      { no: 3, stage: "PRE_DECLARED", declarationNo: "3", sent: null, current: now },
      { no: 4, stage: "CLEARED", declarationNo: "4", sent, current: now },
      { no: 5, stage: "DECLARED", declarationNo: "5", sent, current: sent },
    ]);
    expect(r).toEqual({ changed: [{ no: 1, common: ["CQHQ"], lines: false }], unverified: [3] });
  });
  it("lý do: số chỉ tiêu từ catalog; đổi cả chỉ tiêu chung lẫn dòng → kèm \"dòng hàng tờ n\"; chỉ dòng hàng → linesOnly", () => {
    expect(sentSheetsReason("IDA", { changed: [], unverified: [] })).toBeNull();
    expect(sentSheetsReason("IDA", { changed: [{ no: 3, common: ["TK_TP"], lines: true }, { no: 1, common: ["TK_TP", "@ADJ"], lines: false }], unverified: [] }))
      .toEqual({ reason: "SENT_SHEETS_CHANGED", params: { sheets: "1, 3", fields: "1.49, 1.51; dòng hàng tờ 3", numbers: "1.49, 1.51", lineSheets: "3", linesOnly: "0" } });
    expect(sentSheetsReason("IDA", { changed: [{ no: 2, common: [], lines: true }], unverified: [] }))
      .toEqual({ reason: "SENT_SHEETS_CHANGED", params: { sheets: "2", fields: "dòng hàng", numbers: "", lineSheets: "2", linesOnly: "1" } });
  });
  it("lý do: tờ còn hiệu lực không có ảnh chụp (dữ liệu cũ) → SENT_SHEETS_UNVERIFIED nêu đúng các tờ đó (ưu tiên – phải gọi về trước)", () => {
    expect(sentSheetsReason("IDA", { changed: [{ no: 2, common: ["CQHQ"], lines: false }], unverified: [4, 1] })).toEqual({ reason: "SENT_SHEETS_UNVERIFIED", params: { sheets: "1, 4" } });
  });
  it("sentFieldsText: ghép số chỉ tiêu + dòng hàng tờ n theo nhãn (giao diện truyền nhãn theo ngôn ngữ)", () => {
    expect(sentFieldsText("1.51", "")).toBe("1.51");
    expect(sentFieldsText("", "2")).toBe("dòng hàng");
    expect(sentFieldsText("1.51", "2, 3")).toBe("1.51; dòng hàng tờ 2, 3");
    expect(sentFieldsText("1.51", "2", { lines: "line items", linesOf: "line items of sheet(s) {sheets}" })).toBe("1.51; line items of sheet(s) 2");
  });
  it("số chỉ tiêu: TK_TP → 1.51 (IDA) / 2.42 (EDA); mã lạ → giữ mã", () => {
    expect(declarationFieldNo("IDA", "TK_TP")).toBe("1.51");
    expect(declarationFieldNo("EDA", "TK_TP")).toBe("2.42");
    expect(declarationFieldNo("IDA", "ZZZ")).toBe("ZZZ");
  });
});
