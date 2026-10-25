import { describe, expect, it } from "vitest";
import { EMPTY_VALUE_CHARGES, type Shipment, type Sourced } from "@kb/contracts";
import { buildDeclaration, type BuildInput } from "../build.js";
import { EDA_MAPPINGS } from "../mapping/eda.js";
import { evaluateMapping, ruleOptionsView, validateOverrides } from "../mapping/evaluate.js";
import { IDA_MAPPINGS } from "../mapping/ida.js";
import type { MappingInput } from "../mapping/types.js";
import { allocateCustomsValue } from "../valuation.js";
import { DOSSIER, hansol, ORG } from "../test/shipment.js";

const NOW = new Date("2026-10-14T03:00:00.000Z");
const ITEMS = ["3700", "3360"].map((amount, i) => ({ id: `li_${i + 1}`, amount, importDutyRate: "0", vatRate: "8" }));
const EXCHANGE = { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] };
const sv = (value: string | null, kind: Sourced<string>["sources"][number]["kind"] = "ARRIVAL_NOTICE"): Sourced<string> => ({ value, sources: value ? [{ documentId: "d", kind, page: 1, raw: value, normalized: value }] : [], status: "SINGLE_SOURCE" });
const build = (over: Partial<BuildInput> & { tweak?: (s: Shipment) => void } = {}) =>
  buildDeclaration({ shipment: hansol(over.tweak), dossier: DOSSIER, org: ORG, items: ITEMS, now: NOW, exchange: EXCHANGE, ...over });
const input = (s: Shipment = hansol(), extra: Partial<MappingInput> = {}): MappingInput => {
  const valuation = allocateCustomsValue({ items: ITEMS, adjustments: [], currency: "USD", rates: EXCHANGE.rates });
  return { shipment: s, dossier: DOSSIER, org: ORG, now: NOW, adjustments: [], valuation, exchange: EXCHANGE, profile: {}, overrides: {}, lines: [], charges: EMPTY_VALUE_CHARGES, ...extra };
};
const omitProv = ({ provenance: _p, ...rest }: ReturnType<typeof evaluateMapping>) => rest;
const KHO = IDA_MAPPINGS.find((m) => m.code === "KHO")!;

describe("evaluateMapping – không ghi đè giữ đúng y logic cũ", () => {
  it.each([...IDA_MAPPINGS.map((m) => ["IDA", m] as const), ...EDA_MAPPINGS.map((m) => ["EDA", m] as const)])("%s %s", (_k, m) => {
    const i = input();
    const { via: _v, ...expected } = m.from(i) as ReturnType<typeof m.from> & { via?: string };
    expect(omitProv(evaluateMapping(m, undefined, i))).toEqual(expected);
  });
});

describe("quy tắc mới", () => {
  it("KHO: lấy từ Arrival Notice (mã – tên); không có thì mặc định khai báo; không có cả hai thì thiếu", () => {
    const fromAn = build({ tweak: (s) => { s.transport.warehouseCode = sv("02B1A04"); s.transport.warehouseName = sv("KHO SCSC"); } });
    expect(fromAn.fields["KHO"]).toMatchObject({ value: "02B1A04 – KHO SCSC", source: "ARRIVAL_NOTICE", provenance: { via: "default" } });
    expect(fromAn.fields["KHO"]?.suspect).toBeUndefined();
    const nameOnly = build({ tweak: (s) => void (s.transport.warehouseName = sv("CÁT LÁI KHO 3")) });
    expect(nameOnly.fields["KHO"]).toMatchObject({ value: "CÁT LÁI KHO 3", suspect: true });
    expect(build({ profile: { KHO: "03CCS01" } }).fields["KHO"]).toMatchObject({ value: "03CCS01", source: "DEFAULT", provenance: { via: "profile" } });
    expect(build().fields["KHO"]?.suspect).toBe(true);
  });
  it("NGAY_DEN hàng air: không có ETA thì lấy ngày đi (ngày bay) kèm ghi chú; hàng biển không dự phòng", () => {
    const air = build({ dossier: { ...DOSSIER, transportMode: "AIR" }, tweak: (s) => { s.transport.arrivalDate = sv(null); s.transport.departureDate = sv("2024-12-21", "AIR_WAYBILL"); } });
    expect(air.fields["NGAY_DEN"]).toMatchObject({ value: "2024-12-21", source: "BILL_OF_LADING", suspect: true });
    const sea = build({ tweak: (s) => { s.transport.arrivalDate = sv(null); s.transport.departureDate = sv("2026-10-05", "BILL_OF_LADING"); } });
    expect(sea.fields["NGAY_DEN"]?.value).toBe("");
  });
  it("EDA NGAY_DI lấy ngày đi (ngày B/L), không lấy ETA", () => {
    const eda = build({ dossier: { ...DOSSIER, direction: "XK", typeCode: "B11" }, tweak: (s) => void (s.transport.departureDate = sv("2026-10-05", "BILL_OF_LADING")) });
    expect(eda.fields["NGAY_DI"]?.value).toBe("2026-10-05");
  });
  it("chỉ tiêu cố định (PT_TT thiếu, KHAI_TG, NGUOI_NT…) lấy theo mặc định khai báo nếu có", () => {
    const b = build({ profile: { KHAI_TG: "1 – Khai trị giá tổng hợp", NGUOI_NT: "2 – Đại lý hải quan" } });
    expect(b.fields["KHAI_TG"]).toMatchObject({ value: "1 – Khai trị giá tổng hợp", provenance: { via: "profile" } });
    expect(b.fields["NGUOI_NT"]?.value).toBe("2 – Đại lý hải quan");
    expect(build().fields["KHAI_TG"]?.value).toBe("6 – Áp dụng phương pháp trị giá giao dịch");
  });
});

describe("ghi đè của doanh nghiệp", () => {
  it("fixed → giá trị cố định; sources → nguồn đầu tiên có giá trị; nguồn lạ bị bỏ qua, quay về mặc định", () => {
    expect(evaluateMapping(KHO, { fixed: "02CIS01" }, input())).toMatchObject({ value: "02CIS01", source: "DEFAULT", provenance: { via: "fixed" } });
    expect(evaluateMapping(KHO, { sources: ["khong-ton-tai"] }, input()).provenance.via).toBe("default");
    const s = hansol((x) => { x.transport.warehouseCode = sv("02B1A04"); x.transport.warehouseName = sv("KHO SCSC"); });
    expect(evaluateMapping(KHO, { sources: ["profile.KHO", "an.warehouse"] }, input(s, { profile: {} }))).toMatchObject({ value: "02B1A04 – KHO SCSC", provenance: { via: "source", sourceId: "an.warehouse" } });
    expect(evaluateMapping(KHO, { sources: ["profile.KHO", "an.warehouse"] }, input(s, { profile: { KHO: "03CCS01" } }))).toMatchObject({ value: "03CCS01", provenance: { via: "source", sourceId: "profile.KHO" } });
  });
  it("buildDeclaration áp ghi đè và ghi nguồn gốc", () => {
    expect(build({ overrides: { KHO: { fixed: "02CIS01" } } }).fields["KHO"]).toMatchObject({ value: "02CIS01", provenance: { via: "fixed", rule: "KHO" } });
  });
  it("validateOverrides: chỉ tiêu trị giá/thuế → FORBIDDEN; nguồn ngoài danh sách / fixed không cho phép / sai định dạng → VALIDATION", () => {
    expect(validateOverrides("IDA", { TONG_TG: { fixed: "1" } })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(validateOverrides("IDA", { TY_GIA: { sources: [] } })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(validateOverrides("IDA", { SO_HD: { fixed: "X" } })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(validateOverrides("IDA", { KHO: { sources: ["la"] } })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(validateOverrides("IDA", { SO_VD: { fixed: "X" } })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(validateOverrides("IDA", { NGAY_DEN: { sources: ["transport.departureDate", "transport.arrivalDate"] } }).ok).toBe(true);
    expect(validateOverrides("IDA", { KHO: { fixed: "02CIS01" }, PT_TT: { sources: ["profile.PT_TT"] } }).ok).toBe(true);
    // Giá trị cố định cũng phải đúng độ dài mã theo Phụ lục II như Mặc định khai báo (KHO tối đa 7 ký tự).
    expect(validateOverrides("IDA", { KHO: { fixed: "03CCS01XYZ – Kho CFS" } })).toMatchObject({ ok: false, error: { code: "VALIDATION", message: expect.stringContaining("tối đa 7") } });
    expect(validateOverrides("IDA", { NOPE: { fixed: "1" } })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
  it("ruleOptionsView: liệt kê chỉ tiêu có số Phụ lục II, nguồn được chọn; chỉ tiêu trị giá bị khóa", () => {
    const view = ruleOptionsView("IDA");
    expect(view.find((v) => v.code === "KHO")).toMatchObject({ locked: false, allowFixed: true, sources: expect.arrayContaining([expect.objectContaining({ id: "an.warehouse" })]) });
    expect(view.find((v) => v.code === "TONG_TG")).toMatchObject({ locked: true, sources: [], allowFixed: false });
  });
});
