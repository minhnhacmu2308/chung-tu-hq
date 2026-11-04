import { describe, expect, it } from "vitest";
import { Decimal } from "../../../../shared/decimal.js";
import { buildFptRequest, type DeclarationPayload } from "../declaration-to-fpt.js";
import { branchPayload, invoiceTotal, sentSheetsDiff, sentSheetsError, sheetSnapshot } from "../branches.js";

const mk = (n: number, extra: Partial<DeclarationPayload> = {}): DeclarationPayload => ({
  kind: "IDA", direction: "NK", currency: "USD", containers: [],
  fields: { MA_LH: { value: "A11" }, NNK_MST: { value: "0316789012" } },
  // đảo thứ tự để chắc chắn sắp theo lineNo
  items: Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, lineNo: i + 1, description: `Hàng ${i + 1}`, quantity: "10", unit: "PCE", unitPrice: "1.5", amount: "15.25", origin: "KR", hsConfirmed: "8482.10.00", importDutyRate: "0", vatRate: "8", policyNote: null })).reverse(),
  adjustments: [{ label: "Phí khác", amount: "100", currency: "USD", kind: "ADD", code: "A" }],
  ...extra,
});
type Ida = { objVN_IDA: Record<string, unknown>; objVN_IDA_HANG: Record<string, unknown>[]; objVN_IDA_KTG: Record<string, unknown> };

describe("branchPayload", () => {
  const p = mk(120);
  it("invoiceTotal cộng amount bằng Decimal", () => expect(invoiceTotal(p)).toBe("1830"));

  it("nhánh 1: 50 dòng đầu, F / 1 / 3 / TK_TP", () => {
    const b = branchPayload(p, 1, null);
    expect(b.blockers).toEqual([]);
    expect(b.payload.items).toHaveLength(50);
    expect(b.payload.items[0]!.lineNo).toBe(1);
    expect(b.payload.fields.TK_FIC!.value).toBe("F");
    expect(b.payload.fields.TK_BNO!.value).toBe("1");
    expect(b.payload.fields.TK_DNO!.value).toBe("3");
    expect(b.payload.fields.TK_TP!.value).toBe(invoiceTotal(p));
    expect(b.range).toMatchObject({ no: 1, of: 3 });
  });

  it("nhánh 2: TK_FIC là số tờ khai đầu, dòng 51–100", () => {
    const b = branchPayload(p, 2, "104000000001");
    expect(b.blockers).toEqual([]);
    expect(b.payload.fields.TK_FIC!.value).toBe("104000000001");
    expect(b.payload.items.map((i) => i.lineNo)).toEqual(Array.from({ length: 50 }, (_, i) => 51 + i));
  });

  it("nhánh 2 chưa có số tờ khai đầu → blocker", () => {
    expect(branchPayload(p, 2, null).blockers).toEqual(["Tờ 2/3: chưa có số tờ khai đầu tiên (tờ 1)"]);
  });

  it("TK_TP luôn tự tính = tổng trị giá hóa đơn cả lô – giá trị sửa tay (kể cả USER) bị bỏ qua (VNACCS phân bổ thuế theo hệ số)", () => {
    const q = mk(120, { fields: { TK_TP: { value: "999", source: "USER" } } });
    expect(branchPayload(q, 1, null).payload.fields.TK_TP!.value).toBe(invoiceTotal(q));
    expect(branchPayload(q, 2, "104000000001").payload.fields.TK_TP!.value).toBe(invoiceTotal(q));
  });

  it("40 dòng: ô tách tờ nhập tay cũ (TK_TP/TK_DNO/TK_FIC/TK_BNO) bị bỏ – không gửi Hải quan, không sinh KTG_VT", () => {
    const q = mk(40, { fields: { TK_TP: { value: "999", source: "USER" }, TK_DNO: { value: "2", source: "USER" }, TK_FIC: { value: "F" }, TK_BNO: { value: "1" } } });
    const out = branchPayload(q, 1, null).payload.fields;
    for (const k of ["TK_TP", "TK_DNO", "TK_FIC", "TK_BNO"]) expect(out[k]).toBeUndefined();
    const req = buildFptRequest(branchPayload(q, 1, null).payload) as unknown as { request?: Record<string, Record<string, unknown>> };
    expect(JSON.stringify(req)).not.toMatch(/tK_TP"|ktG_VT1|tK_DNO/);
  });
  it("40 dòng: payload không đổi", () => {
    const q = mk(40);
    const snap = structuredClone(q);
    expect(branchPayload(q, 1, null).payload).toEqual(snap);
    expect(q).toEqual(snap);
  });

  it("không đổi payload gốc khi tách", () => {
    const snap = structuredClone(p);
    branchPayload(p, 2, "104000000001");
    expect(p).toEqual(snap);
  });

  it("buildFptRequest nhánh 2: HAG_B25 bắt đầu 01 và KTG_VT1 = TK_TP; lô 40 dòng không có KTG_VT1", () => {
    const b = branchPayload(p, 2, "104000000001");
    const r = buildFptRequest(b.payload).request as unknown as Ida;
    expect(r.objVN_IDA_HANG[0]!["haG_B25"]).toBe("01");
    expect(r.objVN_IDA_KTG["ktG_VT1"]).toBe(Number(b.payload.fields.TK_TP!.value));
    expect(r.objVN_IDA["tK_FIC"]).toBe("104000000001");
    expect(r.objVN_IDA["tK_BNO"]).toBe(2);
    expect(r.objVN_IDA["tK_DNO"]).toBe(3);
    const small = buildFptRequest(mk(40)).request as unknown as Ida;
    expect(small.objVN_IDA_KTG["ktG_VT1"]).toBeUndefined();
  });

  it("tờ khai xuất 120 dòng: mọi tờ nhánh gửi cùng 2.59 (mã, tên, địa chỉ) và 2.60 (số container) như tờ gốc; 2.2 đúng từng tờ", () => {
    const con = { CON_VC1: { value: "03CCS01" }, CON_VC2: { value: "03CCS02" }, CON_VN: { value: "Kho CFS Đình Vũ" }, CON_VA: { value: "KCN Đình Vũ, Hải Phòng" }, CON_C01: { value: "SITU2246781" }, CON_C02: { value: "SITU2246782" } };
    const eda = mk(120, { kind: "EDA", direction: "XK", containers: ["SITU2246781", "SITU2246782"], adjustments: [], fields: { MA_LH: { value: "B11" }, PTVC: { value: "2 – Đường biển (container)" }, NXK_MST: { value: "0316789012" }, ...con } });
    type Eda = { objVN_EDA: Record<string, unknown>; objVN_EDA_CON: Record<string, unknown> | null; objVN_EDA_HANG: unknown[] };
    const sheets = [1, 2, 3].map((no) => buildFptRequest(branchPayload(eda, no, "305000000001").payload).request as unknown as Eda);
    expect(sheets.map((r) => r.objVN_EDA_HANG.length)).toEqual([50, 50, 20]);
    expect(sheets.map((r) => [r.objVN_EDA["tK_FIC"], r.objVN_EDA["tK_BNO"], r.objVN_EDA["tK_DNO"]])).toEqual([["F", 1, 3], ["305000000001", 2, 3], ["305000000001", 3, 3]]);
    expect(sheets[0]!.objVN_EDA_CON).toMatchObject({ coN_VC1: "03CCS01", coN_VC2: "03CCS02", coN_VN: "Kho CFS Đình Vũ", coN_VA: "KCN Đình Vũ, Hải Phòng", coN_C01: "SITU2246781", coN_C02: "SITU2246782" });
    expect(sheets[1]!.objVN_EDA_CON).toEqual(sheets[0]!.objVN_EDA_CON);
    expect(sheets[2]!.objVN_EDA_CON).toEqual(sheets[0]!.objVN_EDA_CON);
  });

  it("tổng amount các nhánh = invoiceTotal", () => {
    const sum = [1, 2, 3].map((n) => invoiceTotal(branchPayload(p, n, "104000000001").payload)).reduce((a, b) => new Decimal(a).plus(b), new Decimal(0)).toFixed();
    expect(sum).toBe(invoiceTotal(p));
  });
});

describe("branchPayload – số tờ không hợp lệ", () => {
  it.each([[120, 0], [120, 4], [120, Number.NaN], [40, 2]])("lô %i dòng, no=%s → chặn, không có dòng", (n, no) => {
    const b = branchPayload(mk(n), no, "104000000001");
    expect(b.blockers).toEqual([`Tờ ${no}: không có trong lô (${n === 120 ? 3 : 1} tờ)`]);
    expect(b.payload.items).toEqual([]);
  });
});

describe("sheetSnapshot / sentSheetsDiff / sentSheetsError (nội dung đã gửi từng tờ – spec §2.5)", () => {
  const sent = mk(120, { fields: { MA_LH: { value: "A11" }, CQHQ: { value: "03CE" }, NNK_MST: { value: "0316789012" } } });
  const sheets = (p: DeclarationPayload, stages: string[] = ["PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED"]) =>
    stages.map((stage, i) => ({ no: i + 1, stage: stage as "PRE_DECLARED", declarationNo: `10400000000${i + 1}`, sent: sheetSnapshot(sent, i + 1) }));
  const edit = (f: (p: DeclarationPayload) => void) => {
    const p = structuredClone(sent);
    f(p);
    return p;
  };
  const byNo = (p: DeclarationPayload, st?: string[]) => sentSheetsDiff(p, sheets(sent, st));

  it("không đổi gì → mọi tờ không khác", () => {
    expect(byNo(sent)).toEqual([1, 2, 3].map((no) => ({ no, common: [], lines: false })));
  });
  it("đổi TK_FIC (chỉ tiêu riêng từng tờ) → không khác", () => {
    expect(byNo(edit((p) => { p.fields.TK_FIC = { value: "X" }; })).every((d) => !d.common.length && !d.lines)).toBe(true);
  });
  it("đổi CQHQ → common chứa CQHQ ở mọi tờ còn hiệu lực", () => {
    expect(byNo(edit((p) => { p.fields.CQHQ = { value: "01AB" }; })).map((d) => d.common)).toEqual([["CQHQ"], ["CQHQ"], ["CQHQ"]]);
  });
  it("đổi amount dòng 60 (tờ 2) → tờ 2 lines + TK_TP đổi mọi tờ; tờ 1, 3 lines false", () => {
    const d = byNo(edit((p) => { p.items.find((i) => i.lineNo === 60)!.amount = "99"; }));
    expect(d.map((x) => x.lines)).toEqual([false, true, false]);
    expect(d.every((x) => x.common.includes("TK_TP"))).toBe(true);
  });
  it("đổi ô HANG.<id dòng 10>.X → chỉ tờ 1 lines", () => {
    expect(byNo(edit((p) => { p.fields["HANG.i10.X"] = { value: "1" }; })).map((x) => [x.lines, x.common])).toEqual([[true, []], [false, []], [false, []]]);
  });
  it("TK_TP sửa tay không làm đổi nội dung đã gửi (luôn tự tính)", () => {
    expect(byNo(edit((p) => { p.fields.TK_TP = { value: "1", source: "USER" }; }))[0]?.common ?? []).toEqual([]);
  });
  it("tờ RECALLED / CLEARED / không sent → không xét", () => {
    const p = edit((x) => { x.fields.CQHQ = { value: "01AB" }; });
    const s = sheets(sent, ["RECALLED", "CLEARED", "PRE_DECLARED"]);
    s[2] = { ...s[2]!, sent: null as never };
    expect(sentSheetsDiff(p, s)).toEqual([]);
  });
  it("sentSheetsError: liệt kê tờ đổi + tờ còn hiệu lực không có sent (dữ liệu cũ); số chỉ tiêu 1.51", () => {
    const p = edit((x) => { x.items.find((i) => i.lineNo === 60)!.amount = "99"; });
    const s = sheets(sent, ["PRE_DECLARED", "RECALLED", "PRE_DECLARED"]);
    expect(sentSheetsError(p, s)).toMatchObject({ code: "BLOCKER_FAILED", reason: "SENT_SHEETS_CHANGED", params: { sheets: "1, 3", fields: "1.51", numbers: "1.51", lineSheets: "", linesOnly: "0" } });
    expect(sentSheetsError(sent, s)).toBeNull();
    const legacy = s.map((x) => (x.no === 3 ? { ...x, sent: null } : x));
    expect(sentSheetsError(sent, legacy)).toMatchObject({ code: "BLOCKER_FAILED", reason: "SENT_SHEETS_UNVERIFIED", params: { sheets: "3" }, message: "Tờ 3 khai trước khi hệ thống lưu nội dung đã gửi – không kiểm tra được, gọi về các tờ này trước khi sửa" });
  });
  it("sentSheetsError: đổi cả chỉ tiêu chung lẫn dòng của tờ còn hiệu lực → fields kèm \"dòng hàng tờ n\"; NGAY_DK (ngày khai dự kiến, hệ thống) đổi → không khác", () => {
    const p = edit((x) => { x.fields.CQHQ = { value: "01AB" }; x.items.find((i) => i.lineNo === 10)!.description = "khác"; x.fields.NGAY_DK = { value: "2026-12-31" }; });
    const e = sentSheetsError(p, sheets(sent, ["PRE_DECLARED", "RECALLED", "PRE_DECLARED"]));
    expect(e).toMatchObject({ reason: "SENT_SHEETS_CHANGED", params: { sheets: "1, 3", lineSheets: "1", fields: expect.stringMatching(/; dòng hàng tờ 1$/) } });
    expect(sentSheetsError(edit((x) => { x.fields.NGAY_DK = { value: "2026-12-31" }; }), sheets(sent))).toBeNull();
  });
});
