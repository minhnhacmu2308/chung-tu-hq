import type { Shipment } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import type { DossierProfile } from "../../helpers.js";
import { anphatExport, hansol, NK_AIR, NK_SEA, ORG, XK_SEA } from "../../test/shipments.js";
import { ruleByCode } from "../index.js";

const run = (code: string, s: Shipment, dossier?: DossierProfile) => ruleByCode(code)!.run(s, dossier ? { org: ORG, dossier } : { org: ORG });
const air = (s: Shipment) => {
  s.transport.containers = [];
  s.transport.billNo.value = "180-12345675";
};

describe("R-PACKAGES-INTEGER (BLOCKER)", () => {
  it("PASS: 48 kiện", () => expect(run("R-PACKAGES-INTEGER", hansol()).result).toBe("PASS"));
  it("FAIL: 48,5 kiện (có phần thập phân)", () => {
    const r = run("R-PACKAGES-INTEGER", hansol((s) => (s.transport.packages.value = "48.5")));
    expect(r.result).toBe("FAIL");
    expect(r.detail).toMatch(/48,5/);
    expect(r.fields).toEqual(["/transport/packages"]);
  });
  it("SKIPPED khi chưa có số kiện", () => expect(run("R-PACKAGES-INTEGER", hansol((s) => (s.transport.packages.value = null))).result).toBe("SKIPPED"));
  it("biên: '48.00' PASS (nguyên), 0 kiện FAIL", () => {
    expect(run("R-PACKAGES-INTEGER", hansol((s) => (s.transport.packages.value = "48.00"))).result).toBe("PASS");
    expect(run("R-PACKAGES-INTEGER", hansol((s) => (s.transport.packages.value = "0"))).result).toBe("FAIL");
  });
});

describe("R-GROSS-WEIGHT-DIGITS (BLOCKER)", () => {
  it("PASS: đường biển 3.860,5 kg", () => expect(run("R-GROSS-WEIGHT-DIGITS", hansol(), NK_SEA).result).toBe("PASS"));
  it("FAIL: đường biển 1.234.567 kg (7 chữ số > 6)", () => {
    const r = run("R-GROSS-WEIGHT-DIGITS", hansol((s) => (s.transport.grossWeightKg.value = "1234567")), NK_SEA);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toMatch(/1\.234\.567 kg có 7 chữ số phần nguyên.*tối đa 6/);
  });
  it("WARN: đường không 125,25 kg (2 thập phân > 1) – ghi trọng lượng chính xác vào Phần ghi chú", () => {
    const r = run("R-GROSS-WEIGHT-DIGITS", hansol((s) => { air(s); s.transport.grossWeightKg.value = "125.25"; }), NK_AIR);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/2 chữ số thập phân.*tối đa 1.*Phần ghi chú/);
  });
  it("SKIPPED khi chưa có hồ sơ, thiếu trọng lượng, hoặc phương thức '9'", () => {
    expect(run("R-GROSS-WEIGHT-DIGITS", hansol()).result).toBe("SKIPPED");
    expect(run("R-GROSS-WEIGHT-DIGITS", hansol((s) => (s.transport.grossWeightKg.value = null)), NK_SEA).result).toBe("SKIPPED");
    expect(run("R-GROSS-WEIGHT-DIGITS", hansol(), { ...NK_SEA, transportMode: "OTHER" }).result).toBe("SKIPPED");
  });
  it("biên: đường không 12.345.678 kg (8 số nguyên) PASS; đường biển 999.999,999 PASS, 1,2345 WARN", () => {
    expect(run("R-GROSS-WEIGHT-DIGITS", hansol((s) => (s.transport.grossWeightKg.value = "12345678")), NK_AIR).result).toBe("PASS");
    expect(run("R-GROSS-WEIGHT-DIGITS", hansol((s) => (s.transport.grossWeightKg.value = "999999.999")), NK_SEA).result).toBe("PASS");
    expect(run("R-GROSS-WEIGHT-DIGITS", hansol((s) => (s.transport.grossWeightKg.value = "1.2345")), NK_SEA).result).toBe("WARN");
  });
});

describe("R-AWB-LENGTH (BLOCKER)", () => {
  it("PASS: AWB 12 ký tự", () => {
    const r = run("R-AWB-LENGTH", hansol(air), NK_AIR);
    expect(r.result).toBe("PASS");
    expect(r.fields).toEqual(["/transport/billNo"]);
  });
  it("FAIL: số vận đơn 23 ký tự", () => {
    const r = run("R-AWB-LENGTH", hansol((s) => { air(s); s.transport.billNo.value = "180-12345675-HAWB-00001"; }), NK_AIR);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toMatch(/23 ký tự.*không quá 20/);
  });
  it("SKIPPED khi không phải đường không hoặc chưa có hồ sơ", () => {
    expect(run("R-AWB-LENGTH", hansol(), NK_SEA).result).toBe("SKIPPED");
    expect(run("R-AWB-LENGTH", hansol(air)).result).toBe("SKIPPED");
  });
  it("biên: không có HAWB → dùng MAWB; đúng 20 ký tự PASS", () => {
    const r = run("R-AWB-LENGTH", hansol((s) => { air(s); s.transport.billNo.value = null; s.transport.masterBillNo.value = "12345678901234567890"; }), NK_AIR);
    expect(r.result).toBe("PASS");
    expect(r.fields).toEqual(["/transport/masterBillNo"]);
  });
});

describe("R-CONTAINER-LIST (BLOCKER)", () => {
  it("PASS NK: container có seal → nhắc khai HYS sau khi có số tờ khai", () => {
    const r = run("R-CONTAINER-LIST", hansol(), NK_SEA);
    expect(r.result).toBe("PASS");
    expect(r.detail).toContain("CMAU1234452/S1");
    expect(r.detail).toContain("HYS");
  });
  it("FAIL XK: hàng container không có số container (TT121 Điều 18 khoản 1 điểm k)", () => {
    const r = run("R-CONTAINER-LIST", anphatExport((s) => (s.transport.containers = [])), XK_SEA);
    expect(r.result).toBe("FAIL");
    expect(r.detail).toBe("Tờ khai xuất hàng container phải khai đầy đủ số container (TT121, Điều 18 khoản 1 điểm k)");
  });
  it("WARN NK: không có container hoặc container thiếu seal", () => {
    expect(run("R-CONTAINER-LIST", hansol((s) => (s.transport.containers = [])), NK_SEA).result).toBe("WARN");
    const r = run("R-CONTAINER-LIST", hansol((s) => s.transport.containers.push({ no: "TGHU0000001", sealNo: null, size: "20GP" })), NK_SEA);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/^1\/2 container chưa có số seal: TGHU0000001/);
  });
  it("PASS XK có 2 container; WARN XK hơn 50 container (chỉ tiêu 2.60)", () => {
    expect(run("R-CONTAINER-LIST", anphatExport(), XK_SEA).result).toBe("PASS");
    const many = Array.from({ length: 51 }, (_, k) => ({ no: `TGHU${String(k).padStart(7, "0")}`, sealNo: "S", size: "40HC" }));
    const r = run("R-CONTAINER-LIST", anphatExport((s) => (s.transport.containers = many)), XK_SEA);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/51 container.*2\.60/);
  });
  it("SKIPPED: chưa có hồ sơ, hoặc hàng rời không có container", () => {
    expect(run("R-CONTAINER-LIST", hansol()).result).toBe("SKIPPED");
    expect(run("R-CONTAINER-LIST", hansol((s) => (s.transport.containers = [])), { ...NK_SEA, transportMode: "SEA_BULK" }).result).toBe("SKIPPED");
  });
  it("biên: đường không mà chứng từ có container → WARN không khai container", () => {
    const r = run("R-CONTAINER-LIST", hansol(), NK_AIR);
    expect(r.result).toBe("WARN");
    expect(r.detail).toMatch(/^Đường hàng không không khai số lượng container/);
  });
});
