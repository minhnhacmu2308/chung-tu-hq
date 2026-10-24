import { describe, expect, it } from "vitest";
import { buildFptRequest, type DeclarationPayload } from "../declaration-to-fpt.js";
import { branchPayload, invoiceTotal } from "../branches.js";

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

  it("TK_TP có source USER thì giữ", () => {
    const q = mk(120, { fields: { TK_TP: { value: "999", source: "USER" } } });
    expect(branchPayload(q, 1, null).payload.fields.TK_TP!.value).toBe("999");
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

  it("tổng amount các nhánh = invoiceTotal", () => {
    const sum = [1, 2, 3].map((n) => invoiceTotal(branchPayload(p, n, "104000000001").payload)).reduce((a, b) => (Number(a) + Number(b)).toString());
    expect(Number(sum)).toBe(Number(invoiceTotal(p)));
  });
});
