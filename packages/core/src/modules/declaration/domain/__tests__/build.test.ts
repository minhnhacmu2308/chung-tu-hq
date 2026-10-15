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
  it("MFN B01; C/O AK hợp lệ → thuế ưu đãi đặc biệt B06 (AKFTA theo bảng TT39); E21 miễn thuế; XK 0/0; HS không có → 0/8", () => {
    expect(ratesFor(hs, { direction: "NK", typeCode: "A11", coForm: null })).toMatchObject({ importDutyRate: "3", vatRate: "8", taxTableCode: "B01" });
    expect(ratesFor(hs, { direction: "NK", typeCode: "A11", coForm: "AK" })).toMatchObject({ importDutyRate: "0", vatRate: "8", taxTableCode: "B06", policyNote: expect.stringMatching(/AKFTA/) });
    expect(ratesFor(hs, { direction: "NK", typeCode: "A11", coForm: "E" })).toMatchObject({ importDutyRate: "3", taxTableCode: "B01" });
    expect(ratesFor(hs, { direction: "NK", typeCode: "E21", coForm: "AK" })).toMatchObject({ importDutyRate: "0", vatRate: "0" });
    expect(ratesFor(hs, { direction: "XK", typeCode: "B11", coForm: null })).toMatchObject({ importDutyRate: "0", vatRate: "0" });
    expect(ratesFor(null, { direction: "NK", typeCode: "A11", coForm: null })).toMatchObject({ importDutyRate: "0", vatRate: "8" });
  });
  it("mã biểu thuế theo bảng TT39: AJCEP B09, VJEPA B10; EVFTA không có mã trong văn bản → để trống (không dùng B17 – Chương 98)", () => {
    const multi = { ...hs, pref: { AJ: "1", VJ: "2", EVFTA: "0" } };
    expect(ratesFor(multi, { direction: "NK", typeCode: "A11", coForm: "AJ" })).toMatchObject({ importDutyRate: "1", taxTableCode: "B09" });
    expect(ratesFor(multi, { direction: "NK", typeCode: "A11", coForm: "VJ" })).toMatchObject({ importDutyRate: "2", taxTableCode: "B10" });
    expect(ratesFor(multi, { direction: "NK", typeCode: "A11", coForm: "EVFTA" })).toMatchObject({ importDutyRate: "0", taxTableCode: "" });
  });
  it("HS có chính sách riêng → ghi chú vẫn mở đầu bằng tên FTA (bước truyền suy mã biểu thuế từ tên)", () => {
    expect(ratesFor({ ...hs, policy: "Kiểm tra chất lượng" }, { direction: "NK", typeCode: "A11", coForm: "AK" }).policyNote).toBe("AKFTA (C/O form AK); Kiểm tra chất lượng");
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
    expect(f("PTVC").value).toBe("2 – Đường biển (chứa trong container)");
    expect(f("CANG_XEP").value).toBe("KRPUS – Busan");
    expect(f("CANG_DO")).toMatchObject({ value: "VNHPH – Cảng Hải Phòng", source: "BILL_OF_LADING" });
    // T/T thường là KC (TTR = chuyển tiền bồi hoàn bằng điện); nghi ngờ vì model không chắc chuỗi gốc.
    expect(f("PT_TT")).toMatchObject({ value: "KC – Khác (bao gồm cả TT)", suspect: true, note: expect.stringMatching(/T\/T 30 days/) });
    expect(f("SO_KIEN").value).toBe("48 PX");
    expect(f("HD_PL").value).toBe("A – Hóa đơn thương mại");
    expect(f("GIA_PL").value).toBe("A – Giá hóa đơn cho hàng hóa phải trả tiền");
    expect(f("DK_GIA").value).toBe("FCA");
    expect(f("PTVC_TEN").value).toBe("SITC HAIPHONG V.2641S");
    expect(f("SO_VD")).toMatchObject({ value: "HPSEL2610078", source: "BILL_OF_LADING" });
    expect(f("SO_CO").value).toBe("KR2610-0457-AK (form AK)");
    expect(f("GHI_CHU")).toMatchObject({ value: "C/O form AK số KR2610-0457-AK; Container: SITU2246781", suspect: true, note: expect.stringMatching(/ngày cấp C\/O/) });
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
    // CV 2061: không tự điền MO – để trống, nghi ngờ và chặn phê duyệt đến khi người khai chọn MO/CU.
    expect(f("VBPQ")).toMatchObject({ no: "1.37", value: "", suspect: true, blocking: true, note: expect.stringMatching(/MO.*CU.*CV 2061/) });
    expect(built.suspectCount).toBe(5); // TRONG_LUONG, KHO, PT_TT, VBPQ, GHI_CHU (ngày C/O)
  });
  it("VBPQ xét HS đã xác nhận trước HS trên invoice: xác nhận 3926 cho mọi dòng → không cần MO/CU", () => {
    const items = ITEMS.map((it, k) => ({ ...it, lineNo: k + 1, hsConfirmed: "39269099" }));
    const b = buildDeclaration({ shipment: hansol(), dossier: DOSSIER, org: ORG, items, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(b.fields["VBPQ"]).toMatchObject({ value: "", source: "SYSTEM" });
    expect(b.fields["VBPQ"]?.blocking).toBeUndefined();
  });
  it("ghi chú vượt 100 ký tự (chỉ tiêu 1.68) → nghi ngờ, hướng dẫn khai phần còn lại qua HYS", () => {
    const b = buildDeclaration({ shipment: hansol(), dossier: { ...DOSSIER, note: "x".repeat(90) }, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(b.fields["GHI_CHU"]).toMatchObject({ suspect: true, note: expect.stringMatching(/vượt giới hạn 100 ký tự.*HYS/) });
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
