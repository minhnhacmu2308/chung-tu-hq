import type { Shipment } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import type { DossierProfile } from "../../helpers.js";
import { anphatExport, hansol, NK_SEA, ORG, XK_SEA } from "../../test/shipments.js";
import { normalizeIncoterm } from "../incoterm-code.js";
import { ruleByCode } from "../index.js";

const run = (code: string, s: Shipment, dossier?: DossierProfile) => ruleByCode(code)!.run(s, dossier ? { org: ORG, dossier } : { org: ORG });
const term = (v: string | null) => (s: Shipment) => (s.invoice.incoterm.value = v);

describe("normalizeIncoterm", () => {
  it("lấy mã đầu, gộp các cách viết C&F / C&I, bỏ tiền tố Incoterms", () => {
    expect(normalizeIncoterm("FOB HAIPHONG")).toBe("FOB");
    expect(normalizeIncoterm("cif hai phong, vietnam")).toBe("CIF");
    expect(normalizeIncoterm("C AND F Haiphong")).toBe("C&F");
    expect(normalizeIncoterm("CNF")).toBe("C&F");
    expect(normalizeIncoterm("C & F")).toBe("C&F");
    expect(normalizeIncoterm("C&I")).toBe("C&I");
    expect(normalizeIncoterm("Incoterms 2020 DAP Hanoi")).toBe("DAP");
    expect(normalizeIncoterm("CFR")).toBe("CFR");
  });
});

describe("R-INCOTERM-CODE (BLOCKER)", () => {
  it("PASS: FCA Busan (NK) và FOB Haiphong (XK)", () => {
    expect(run("R-INCOTERM-CODE", hansol(), NK_SEA).result).toBe("PASS");
    const r = run("R-INCOTERM-CODE", anphatExport(), XK_SEA);
    expect(r.result).toBe("PASS");
    expect(r.detail).toMatch(/FOB.*2\.39/);
  });
  it("FAIL: mã không có trong bảng (FOT)", () => {
    const r = run("R-INCOTERM-CODE", hansol(term("FOT Busan")), NK_SEA);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toBe("Điều kiện giao hàng 'FOT Busan' không có trong bảng mã chỉ tiêu 1.44/2.39");
    expect(r.fields).toEqual(["/invoice/incoterm"]);
  });
  it("SKIPPED khi chưa có điều kiện giao hàng", () => expect(run("R-INCOTERM-CODE", hansol(term(null))).result).toBe("SKIPPED"));
  it("biên DPU: XK FAIL (Mẫu 02 không có DPU); NK WARN (khai DAT + 1.50); chưa có hồ sơ WARN", () => {
    const xk = run("R-INCOTERM-CODE", anphatExport(term("DPU Tokyo")), XK_SEA);
    expect(xk.result).toBe("FAIL");
    expect(xk.detail).toMatch(/Mẫu 02 \(chỉ tiêu 2\.39\) không có mã DPU/);
    const nk = run("R-INCOTERM-CODE", hansol(term("DPU Haiphong")), NK_SEA);
    expect(nk.result).toBe("WARN");
    expect(nk.detail).toContain("Nếu phần mềm khai chưa nhận DPU: khai DAT và ghi DPU ở chỉ tiêu 1.50 (TT121)");
    expect(run("R-INCOTERM-CODE", hansol(term("DPU"))).result).toBe("WARN");
  });
  it("biên: 'C AND F' và 'Incoterms 2020 CIF' được nhận", () => {
    expect(run("R-INCOTERM-CODE", hansol(term("C AND F Haiphong")), NK_SEA).result).toBe("PASS");
    expect(run("R-INCOTERM-CODE", hansol(term("Incoterms 2020 CIF")), NK_SEA).result).toBe("PASS");
  });
});

describe("R-INSURANCE-INCOTERM (WARNING, chỉ NK)", () => {
  const ins = (v: string) => (s: Shipment) => (s.charges.insurance = { value: v, sources: [], status: "SINGLE_SOURCE" });
  it("PASS: FCA + phí bảo hiểm riêng 25,5 USD → cộng vào trị giá (1.48)", () => {
    const r = run("R-INSURANCE-INCOTERM", hansol(ins("25.5")), NK_SEA);
    expect(r.result).toBe("PASS");
    expect(r.detail).toBe("Phí bảo hiểm 25,5 USD cộng vào trị giá (1.48)");
  });
  it("WARN: CIF đã gồm bảo hiểm – không khai 1.48", () => {
    const r = run("R-INSURANCE-INCOTERM", hansol((s) => { ins("25.5")(s); s.invoice.incoterm.value = "CIF Haiphong"; }), NK_SEA);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/^Điều kiện CIF đã gồm phí bảo hiểm – không khai chỉ tiêu 1\.48, không cộng thêm vào trị giá tính thuế/);
  });
  it("SKIPPED khi không có phí bảo hiểm", () => expect(run("R-INSURANCE-INCOTERM", hansol(), NK_SEA).result).toBe("SKIPPED"));
  it("biên: C AND I (→ C&I) WARN; tiền tệ bảo hiểm riêng (VND) được ghi đúng", () => {
    expect(run("R-INSURANCE-INCOTERM", hansol((s) => { ins("100")(s); s.invoice.incoterm.value = "C AND I"; }), NK_SEA).result).toBe("WARN");
    const r = run("R-INSURANCE-INCOTERM", hansol((s) => { ins("1250000")(s); s.charges.insuranceCurrency = { value: "VND", sources: [], status: "SINGLE_SOURCE" }; }), NK_SEA);
    expect(r.detail).toBe("Phí bảo hiểm 1.250.000 VND cộng vào trị giá (1.48)");
  });
  it("chỉ áp dụng NK", () => expect(ruleByCode("R-INSURANCE-INCOTERM")!.directions).toEqual(["NK"]));
});

describe("R-PARTY-NAME-LENGTH (WARNING)", () => {
  const longName = "A".repeat(71);
  it("PASS: tên người bán HANSOL (NK) vừa 70 ký tự", () => expect(run("R-PARTY-NAME-LENGTH", hansol(), NK_SEA).result).toBe("PASS"));
  it("WARN NK: tên người bán 71 ký tự → viết tắt (1.20); địa chỉ 150 ký tự > 140", () => {
    const r = run("R-PARTY-NAME-LENGTH", hansol((s) => { s.parties.seller.name.value = longName; s.parties.seller.address.value = "B".repeat(150); }), NK_SEA);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/Tên người xuất khẩu \(chỉ tiêu 1\.20\) có 71 ký tự – tối đa 70: được viết tắt/);
    expect(r.detail).toMatch(/150 ký tự – tối đa 4 ô × 35 = 140/);
    expect(r.fields).toEqual(["/parties/seller/name", "/parties/seller/address"]);
  });
  it("SKIPPED khi chưa có hồ sơ hoặc chưa đọc được tên, địa chỉ", () => {
    expect(run("R-PARTY-NAME-LENGTH", hansol()).result).toBe("SKIPPED");
    expect(run("R-PARTY-NAME-LENGTH", hansol((s) => { s.parties.seller.name.value = null; s.parties.seller.address.value = null; }), NK_SEA).result).toBe("SKIPPED");
  });
  it("biên XK: kiểm người mua (2.19), không kiểm tên dài của người bán Việt Nam", () => {
    const r = run("R-PARTY-NAME-LENGTH", anphatExport((s) => { s.parties.buyer.name.value = longName; s.parties.seller.name.value = longName; }), XK_SEA);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/người nhập khẩu \(chỉ tiêu 2\.19\)/);
    expect(r.fields).toEqual(["/parties/buyer/name"]);
    expect(run("R-PARTY-NAME-LENGTH", anphatExport((s) => (s.parties.seller.name.value = longName)), XK_SEA).result).toBe("PASS");
  });
});

describe("R-COUNTRY-CODE (BLOCKER)", () => {
  it("PASS: NK người bán KR; XK người mua JP", () => {
    expect(run("R-COUNTRY-CODE", hansol(), NK_SEA).result).toBe("PASS");
    const r = run("R-COUNTRY-CODE", anphatExport(), XK_SEA);
    expect(r.result).toBe("PASS");
    expect(r.fields).toEqual(["/parties/buyer/country"]);
  });
  it("FAIL: nước ghi 'KOREA'", () => {
    const r = run("R-COUNTRY-CODE", hansol((s) => (s.parties.seller.country.value = "KOREA")), NK_SEA);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toBe("Mã nước phải là mã ISO 2 ký tự (ví dụ KR, CN) – đang là 'KOREA' (chỉ tiêu 1.23)");
  });
  it("SKIPPED khi chưa có hồ sơ hoặc chưa có nước", () => {
    expect(run("R-COUNTRY-CODE", hansol()).result).toBe("SKIPPED");
    expect(run("R-COUNTRY-CODE", hansol((s) => (s.parties.seller.country.value = null)), NK_SEA).result).toBe("SKIPPED");
  });
  it("biên: chữ thường 'kr' FAIL; XK người mua 'JPN' FAIL (chỉ tiêu 2.22)", () => {
    expect(run("R-COUNTRY-CODE", hansol((s) => (s.parties.seller.country.value = "kr")), NK_SEA).result).toBe("FAIL");
    const r = run("R-COUNTRY-CODE", anphatExport((s) => (s.parties.buyer.country.value = "JPN")), XK_SEA);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toMatch(/2\.22/);
  });
});
