import { describe, expect, it } from "vitest";
import { DECLARATION_CONDITIONS as C, type ConditionContext } from "./conditions.js";

const ctx = (p: Partial<ConditionContext>): ConditionContext => ({ typeCode: "A11", transportCode: "2", incoterm: "FOB", hasInvoice: true, ...p });

describe("DECLARATION_CONDITIONS – chỉ tiêu theo tình huống", () => {
  it("TEMP_IMPORT: G11–G14 (không phân biệt hoa thường, khoảng trắng); không G15, A11", () => {
    for (const t of ["G11", "g12 ", " G13", "G14"]) expect(C.TEMP_IMPORT.test(ctx({ typeCode: t }))).toBe(true);
    for (const t of ["G15", "A11", ""]) expect(C.TEMP_IMPORT.test(ctx({ typeCode: t }))).toBe(false);
  });
  it("RE_IMPORT chỉ G51; RE_EXPORT G21–G24; TEMP_EXPORT chỉ G61", () => {
    expect(C.RE_IMPORT.test(ctx({ typeCode: "G51" }))).toBe(true);
    expect(C.RE_IMPORT.test(ctx({ typeCode: "G21" }))).toBe(false);
    expect(["G21", "G22", "G23", "G24"].every((t) => C.RE_EXPORT.test(ctx({ typeCode: t })))).toBe(true);
    expect(C.RE_EXPORT.test(ctx({ typeCode: "G25" }))).toBe(false);
    expect(C.TEMP_EXPORT.test(ctx({ typeCode: "G61" }))).toBe(true);
    expect(C.TEMP_EXPORT.test(ctx({ typeCode: "G51" }))).toBe(false);
  });
  it("BY_WATER: mã 2, 3, 6; IN_CONTAINER: chỉ mã 2", () => {
    expect(["2", "3", "6"].every((m) => C.BY_WATER.test(ctx({ transportCode: m })))).toBe(true);
    expect(C.BY_WATER.test(ctx({ transportCode: "1" }))).toBe(false);
    expect(C.IN_CONTAINER.test(ctx({ transportCode: "2" }))).toBe(true);
    expect(C.IN_CONTAINER.test(ctx({ transportCode: "3" }))).toBe(false);
  });
  it("EXPORT_VALUE: FOB có hóa đơn → không; CIF → có; FOB không hóa đơn → có", () => {
    expect(C.EXPORT_VALUE.test(ctx({ incoterm: "FOB" }))).toBe(false);
    expect(C.EXPORT_VALUE.test(ctx({ incoterm: "DAP" }))).toBe(false);
    expect(C.EXPORT_VALUE.test(ctx({ incoterm: "CIF" }))).toBe(true);
    expect(C.EXPORT_VALUE.test(ctx({ incoterm: "FOB", hasInvoice: false }))).toBe(true);
  });
  it("mỗi điều kiện có nhãn giải thích cho người khai", () => {
    for (const c of Object.values(C)) expect(c.label.length).toBeGreaterThan(5);
  });
  it("AIR_IDENT: định danh theo hàng không; HAS_HAWB: hàng không và có phát hành HAWB; SPLIT_CONTAINER: tách vận đơn hàng container", () => {
    expect(C.AIR_IDENT.test(ctx({ identMode: "HANG_KHONG" }))).toBe(true);
    expect(C.AIR_IDENT.test(ctx({ identMode: "BIEN" }))).toBe(false);
    expect(C.AIR_IDENT.test(ctx({}))).toBe(false);
    expect(C.HAS_HAWB.test(ctx({ identMode: "HANG_KHONG", hawbIssued: true }))).toBe(true);
    expect(C.HAS_HAWB.test(ctx({ identMode: "HANG_KHONG", hawbIssued: false }))).toBe(false);
    expect(C.HAS_HAWB.test(ctx({ identMode: "BIEN", hawbIssued: true }))).toBe(false);
    expect(C.SPLIT_CONTAINER.test(ctx({ splitCargo: "1" }))).toBe(true);
    expect(C.SPLIT_CONTAINER.test(ctx({ splitCargo: "0" }))).toBe(false);
  });
});
