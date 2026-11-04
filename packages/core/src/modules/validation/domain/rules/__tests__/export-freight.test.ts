import { EMPTY_VALUE_CHARGES } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { ruleByCode } from "../index.js";
import { anphatExport, ORG, XK_SEA } from "../../test/shipments.js";

const rule = () => ruleByCode("R-EXPORT-FREIGHT-DEDUCT")!;
const src = (value: string | null) => ({ value, sources: [], status: "SINGLE_SOURCE" as const });
const run = (incoterm: string | null, freight: string | null, charges = EMPTY_VALUE_CHARGES) =>
  rule().run(anphatExport((s) => {
    s.invoice.incoterm = src(incoterm);
    s.charges.freight = src(freight);
  }), { org: ORG, dossier: XK_SEA, charges });

describe("R-EXPORT-FREIGHT-DEDUCT (BLOCKER, chỉ tờ khai xuất)", () => {
  it("chỉ áp dụng hàng xuất, mức BLOCKER", () => {
    expect(rule().directions).toEqual(["XK"]);
    expect(rule().severity).toBe("BLOCKER");
  });

  it("PASS: CIF có cước trên chứng từ – nêu số cước sẽ trừ", () => {
    const r = run("CIF BUSAN", "1150");
    expect(r.result).toBe("PASS");
    expect(r.detail).toMatch(/1\.150.*trừ/);
  });

  it("PASS: CFR có số cước người khai nhập", () => {
    expect(run("CFR", null, { ...EMPTY_VALUE_CHARGES, freight: { amount: "900", currency: "USD", reason: "CONTRACT", note: "" } }).result).toBe("PASS");
  });

  it("FAIL: CFR không có số cước, không lý do → chặn, trỏ vào điều kiện giao hàng và cước", () => {
    const r = run("CFR", null);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toMatch(/CFR.*trừ/);
    expect(r.fields).toEqual(["/invoice/incoterm", "/charges/freight"]);
  });

  it("WARN: CIP chưa có số cước nhưng người khai ghi lý do", () => {
    const r = run("CIP", null, { ...EMPTY_VALUE_CHARGES, freight: { amount: null, currency: null, reason: "INVOICE_LATER", note: "" } });
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/Hóa đơn cước bổ sung sau/);
  });

  it("PASS không cần cước: FOB, FCA, EXW, C&I", () => {
    for (const t of ["FOB", "FCA", "EXW", "C&I"]) expect(run(t, null).result).toBe("PASS");
  });

  it("FAIL: DAP, DAF, DDP chưa có số cước – mọi điều kiện nhóm D phải trừ cước", () => {
    for (const t of ["DAP", "DAF", "DDP"]) expect(run(t, null).result).toBe("FAIL");
  });

  it("PASS: phương thức vận chuyển 9 (giao tại chỗ, bán cho DNCX) – DAP không đòi cước", () => {
    const r = rule().run(anphatExport((s) => { s.invoice.incoterm = src("DAP"); s.charges.freight = src(null); }), { org: ORG, dossier: { ...XK_SEA, transportMode: "OTHER" }, charges: EMPTY_VALUE_CHARGES });
    expect(r.result).toBe("PASS");
    expect(r.detail).toMatch(/phương thức vận chuyển 9/);
  });

  it("SKIPPED khi chưa đọc được điều kiện giao hàng", () => {
    expect(run(null, null).result).toBe("SKIPPED");
  });
});
