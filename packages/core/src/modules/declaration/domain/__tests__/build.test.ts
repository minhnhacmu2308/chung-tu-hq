import { describe, expect, it } from "vitest";
import { planAdjustments } from "../adjustments.js";
import { buildDeclaration } from "../build.js";
import { ratesFor } from "../rates.js";
import { DOSSIER, hansol, ORG } from "../test/shipment.js";

const NOW = new Date("2026-10-14T03:00:00.000Z");
const ITEMS = ["3700", "3360", "2700", "2760", "3900", "2952", "1478"].map((amount, i) => ({ id: `li_${i + 1}`, amount, importDutyRate: i === 0 ? "3" : "0", vatRate: "8" }));

describe("adjustments", () => {
  it("FCA: cộng cước từ hóa đơn cước (tiền tệ riêng của cước); phí nội địa VND (THC, D/O) bỏ qua; CIF: không cộng, ghi chú đã gồm", () => {
    const fca = planAdjustments(hansol());
    expect(fca.adjustments).toEqual([{ label: "Cước vận chuyển quốc tế", amount: "1150", currency: "USD", source: "FREIGHT_INVOICE", kind: "ADD" }]);
    const vnd = planAdjustments(hansol((s) => void (s.charges.freightCurrency = { value: "VND", sources: [], status: "SINGLE_SOURCE" })));
    expect(vnd.adjustments[0]).toMatchObject({ amount: "1150", currency: "VND" });
    expect(fca.notes).toEqual([]);
    const cif = planAdjustments(hansol((s) => void (s.invoice.incoterm.value = "CIF")));
    expect(cif.adjustments).toEqual([]);
    expect(cif.notes[0]).toMatch(/đã gồm/);
    const noFreight = planAdjustments(hansol((s) => void (s.charges.freight = { value: null, sources: [], status: "SINGLE_SOURCE" })));
    expect(noFreight.notes[0]).toMatch(/cần cước vận chuyển/);
  });
});

describe("rates", () => {
  const hs = { code: "8482.10.00", description: "Ổ bi cầu", mfn: "3", pref: { AK: "0" }, vat: "8", policy: null, keywords: [] };
  it("MFN B01; C/O AK hợp lệ → thuế ưu đãi đặc biệt B07; E21 miễn thuế; XK 0/0; HS không có → 0/8", () => {
    expect(ratesFor(hs, { direction: "NK", typeCode: "A11", coForm: null })).toMatchObject({ importDutyRate: "3", vatRate: "8", taxTableCode: "B01" });
    expect(ratesFor(hs, { direction: "NK", typeCode: "A11", coForm: "AK" })).toMatchObject({ importDutyRate: "0", vatRate: "8", taxTableCode: "B07", policyNote: expect.stringMatching(/AKFTA/) });
    expect(ratesFor(hs, { direction: "NK", typeCode: "A11", coForm: "E" })).toMatchObject({ importDutyRate: "3", taxTableCode: "B01" });
    expect(ratesFor(hs, { direction: "NK", typeCode: "E21", coForm: "AK" })).toMatchObject({ importDutyRate: "0", vatRate: "0" });
    expect(ratesFor(hs, { direction: "XK", typeCode: "B11", coForm: null })).toMatchObject({ importDutyRate: "0", vatRate: "0" });
    expect(ratesFor(null, { direction: "NK", typeCode: "A11", coForm: null })).toMatchObject({ importDutyRate: "0", vatRate: "8" });
  });
});

describe("buildDeclaration (IDA – HANSOL)", () => {
  const built = buildDeclaration({ shipment: hansol(), dossier: DOSSIER, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
  const f = (code: string) => built.fields[code]!;
  it("người nhập khẩu theo tài khoản (MST), người xuất khẩu theo invoice, mã địa điểm/phương thức được giải mã", () => {
    expect(built.kind).toBe("IDA");
    expect(f("NNK_MST")).toMatchObject({ no: "1.12", value: "0316789012", source: "ACCOUNT" });
    expect(f("NNK_TEN").value).toBe(ORG.name);
    expect(f("NXK_TEN")).toMatchObject({ value: "HANSOL PRECISION CO., LTD.", source: "INVOICE" });
    expect(f("MA_NUOC").value).toBe("KR");
    expect(f("PTVC").value).toBe("2 – Đường biển (container)");
    expect(f("CANG_XEP").value).toBe("KRPUS – Busan");
    expect(f("CANG_DO")).toMatchObject({ value: "VNHPH – Cảng Hải Phòng", source: "BILL_OF_LADING" });
    expect(f("PT_TT")).toMatchObject({ value: "TTR – Chuyển tiền điện (T/T)", suspect: true });
    expect(f("SO_KIEN").value).toBe("48 PL");
    expect(f("PTVC_TEN").value).toBe("SITC HAIPHONG V.2641S");
    expect(f("SO_VD")).toMatchObject({ value: "HPSEL2610078", source: "BILL_OF_LADING" });
    expect(f("SO_CO").value).toBe("KR2610-0457-AK (form AK)");
    expect(f("GHI_CHU").value).toContain("SITU2246781");
    expect(f("SO_QLNB").value).toBe("HS-NK-2610-021");
  });
  it("trọng lượng CONFLICT và kho chưa có → suspect kèm ghi chú; cước FCA là khoản điều chỉnh; trị giá/thuế đúng", () => {
    expect(f("TRONG_LUONG")).toMatchObject({ value: "3860.5", suspect: true, note: "Các chứng từ không khớp nhau" });
    expect(f("KHO")).toMatchObject({ value: "", suspect: true });
    expect(f("PHI_VC")).toMatchObject({ value: "1150 USD", source: "FREIGHT_INVOICE" });
    expect(f("TY_GIA").value).toBe("25400");
    expect(f("NGAY_DK").value).toBe("2026-10-14");
    expect(f("PHI_BH").value).toBe("");
    expect(built.valuation.customsValueVnd).toBe("558800000");
    expect(built.taxes.importDutyVnd).toBe("2974906");
    expect(f("VBPQ")).toMatchObject({ no: "1.37", value: "MO", suspect: true });
    expect(built.suspectCount).toBe(4);
  });
  it("POD nước ngoài → điểm đến cuối tại VN và đánh dấu nghi ngờ; EDA dùng buyer làm người nhập khẩu", () => {
    const b2 = buildDeclaration({ shipment: hansol((s) => void (s.transport.portOfDischarge.value = "SINGAPORE")), dossier: DOSSIER, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(b2.fields["CANG_DO"]).toMatchObject({ value: "VNTVU – Cảng Tân Vũ (Hải Phòng)", suspect: true, note: expect.stringMatching(/chuyển tải/) });
    const eda = buildDeclaration({ shipment: hansol(), dossier: { ...DOSSIER, direction: "XK", typeCode: "B11" }, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(eda.kind).toBe("EDA");
    expect(eda.fields["NXK_MST"]).toMatchObject({ no: "2.11", value: "0316789012", source: "ACCOUNT" });
    expect(eda.fields["NNK_TEN"]?.value).toBe("AN PHAT INDUSTRIAL EQUIPMENT CO., LTD");
    expect(eda.adjustments).toEqual([]);
  });
});
