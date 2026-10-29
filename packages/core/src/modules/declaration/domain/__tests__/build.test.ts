import { describe, expect, it } from "vitest";
import { EMPTY_VALUE_CHARGES, NO_INSURANCE_VALUE, type Shipment, type ValueCharges } from "@kb/contracts";
import { planAdjustments } from "../adjustments.js";
import { buildDeclaration, type BuildInput } from "../build.js";
import { missingBlockingFields, missingRequiredFields } from "../guards.js";
import { ratesFor } from "../rates.js";
import { DOSSIER, hansol, ORG } from "../test/shipment.js";
import { CATALOGS } from "./a016.js";

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

  const noDocFreight = (s: Shipment) => void (s.charges.freight = { value: null, sources: [], status: "SINGLE_SOURCE" });
  const charges = (c: Partial<ValueCharges>): ValueCharges => ({ ...EMPTY_VALUE_CHARGES, ...c });

  it("cước nhập tay: có số → cộng (nguồn USER, thắng hóa đơn cước); chỉ có lý do → không cộng, ghi chú lý do", () => {
    const manual = planAdjustments(hansol(noDocFreight), charges({ freight: { amount: "900", currency: "USD", reason: "FORWARDER_NOTICE", note: "" } }));
    expect(manual.adjustments).toEqual([{ label: "Cước vận chuyển quốc tế", amount: "900", currency: "USD", source: "USER", kind: "ADD" }]);
    const overDoc = planAdjustments(hansol(), charges({ freight: { amount: "1200", currency: "USD", reason: "CONTRACT", note: "" } }));
    expect(overDoc.adjustments).toEqual([expect.objectContaining({ amount: "1200", source: "USER" })]);
    const reasonOnly = planAdjustments(hansol(noDocFreight), charges({ freight: { amount: null, currency: null, reason: "OTHER", note: "chờ forwarder" } }));
    expect(reasonOnly.adjustments).toEqual([]);
    expect(reasonOnly.notes[0]).toMatch(/chưa có số cước.*Khác: chờ forwarder/);
    // CIF: giá đã gồm cước – cước nhập tay không cộng.
    expect(planAdjustments(hansol((s) => void (s.invoice.incoterm.value = "CIF")), charges({ freight: { amount: "900", currency: "USD", reason: "CONTRACT", note: "" } })).adjustments).toEqual([]);
  });

  it("bảo hiểm: không mua → không cộng dù chứng từ có; nhập tay → cộng; CIF → không cộng, ghi chú", () => {
    const withDocIns = (s: Shipment) => void (s.charges.insurance = { value: "30", sources: [], status: "SINGLE_SOURCE" });
    expect(planAdjustments(hansol(withDocIns), charges({ insurance: { mode: "NONE" } })).adjustments.map((a) => a.label)).toEqual(["Cước vận chuyển quốc tế"]);
    expect(planAdjustments(hansol(), charges({ insurance: { mode: "AMOUNT", amount: "25", currency: "USD" } })).adjustments[1]).toEqual({ label: "Phí bảo hiểm", amount: "25", currency: "USD", source: "USER", kind: "ADD" });
    const cif = planAdjustments(hansol((s) => void (s.invoice.incoterm.value = "CIF")), charges({ insurance: { mode: "AMOUNT", amount: "25", currency: "USD" } }));
    expect(cif.adjustments).toEqual([]);
    expect(cif.notes.join(" ")).toMatch(/đã gồm bảo hiểm/);
  });

  it("danh sách khoản điều chỉnh nhập tay thay phí khác đọc từ chứng từ; SB → trừ, giữ mã tên", () => {
    const withOther = (s: Shipment) => void (s.charges.other = [{ label: "Packing charge", amount: "50", currency: "USD", sourceKind: "INVOICE" }]);
    expect(planAdjustments(hansol(withOther)).adjustments.map((a) => a.label)).toContain("Packing charge");
    const manual = planAdjustments(hansol(withOther), charges({ adjustments: [{ code: "C", kind: "AD", amount: "50", currency: "USD", note: "", allocate: true }, { code: "G", kind: "SB", amount: "20", currency: "USD", note: "", allocate: true }] }));
    expect(manual.adjustments.slice(1)).toEqual([
      expect.objectContaining({ code: "C", kind: "ADD", amount: "50", source: "USER", label: "Chi phí đóng gói hàng hóa" }),
      expect.objectContaining({ code: "G", kind: "SUBTRACT", amount: "20", label: "Khoản giảm giá" }),
    ]);
    expect(planAdjustments(hansol(withOther), charges({ adjustments: [] })).adjustments.map((a) => a.label)).toEqual(["Cước vận chuyển quốc tế"]);
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
  const built = buildDeclaration({ catalogs: CATALOGS, shipment: hansol(), dossier: DOSSIER, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
  const f = (code: string) => built.fields[code]!;
  it("người nhập khẩu theo tài khoản (MST), người xuất khẩu theo invoice, mã địa điểm/phương thức được giải mã", () => {
    expect(built.kind).toBe("IDA");
    expect(f("NNK_MST")).toMatchObject({ no: "1.12", value: "0316789012", source: "ACCOUNT" });
    expect(f("NNK_TEN").value).toBe(ORG.name);
    expect(f("NXK_TEN")).toMatchObject({ value: "HANSOL PRECISION CO., LTD.", source: "INVOICE" });
    expect(f("MA_NUOC").value).toBe("KR");
    expect(f("PTVC").value).toBe("2 – Đường biển (chứa trong container)");
    expect(f("CANG_XEP").value).toBe("KRPUS – BUSAN");
    // B/L ghi cảng dỡ chung "HAIPHONG, VIETNAM", nơi giao hàng ghi bến cụ thể "TAN VU TERMINAL" → khai bến cụ thể.
    expect(f("CANG_DO")).toMatchObject({ value: "VNHPN – CANG TAN VU - HP", source: "BILL_OF_LADING" });
    expect(f("CANG_DO").suspect).toBeUndefined();
    // T/T thường là KC (TTR = chuyển tiền bồi hoàn bằng điện); nghi ngờ vì model không chắc chuỗi gốc.
    expect(f("PT_TT")).toMatchObject({ value: "KC – Khác (bao gồm cả TT)", suspect: true, note: expect.stringMatching(/T\/T 30 days/) });
    expect(f("SO_KIEN").value).toBe("48 PK");
    expect(f("HD_PL").value).toBe("A – Hóa đơn thương mại");
    expect(f("GIA_PL").value).toBe("A – Giá hóa đơn cho hàng hóa phải trả tiền");
    expect(f("DK_GIA").value).toBe("FCA");
    expect(f("PTVC_TEN").value).toBe("SITC HAIPHONG V.2641S");
    expect(f("SO_VD")).toMatchObject({ value: "HPSEL2610078", source: "BILL_OF_LADING" });
    expect(f("SO_CO").value).toBe("KR2610-0457-AK (form AK)");
    expect(f("GHI_CHU")).toMatchObject({ value: "C/O mẫu AK số: KR2610-0457-AK; Container: SITU2246781", suspect: true, note: expect.stringMatching(/ngày cấp C\/O/) });
    expect(f("SO_QLNB").value).toBe("HS-NK-2610-021");
  });
  it("trọng lượng CONFLICT và kho chưa có → suspect kèm ghi chú; cước FCA là khoản điều chỉnh; trị giá/thuế đúng", () => {
    expect(f("TRONG_LUONG")).toMatchObject({ value: "3860.5", suspect: true, note: "Các chứng từ không khớp nhau" });
    expect(f("KHO")).toMatchObject({ value: "", suspect: true });
    expect(f("PHI_VC")).toMatchObject({ value: "1150 USD", source: "FREIGHT_INVOICE" });
    expect(f("TY_GIA").value).toBe("25400");
    expect(f("NGAY_DK").value).toBe("2026-10-14");
    // Không có chứng từ bảo hiểm, FCA chưa gồm bảo hiểm → D (không bảo hiểm), người khai mua bảo hiểm thì nhập phí.
    expect(f("PHI_BH")).toMatchObject({ value: NO_INSURANCE_VALUE, source: "SYSTEM" });
    expect(built.valuation.customsValueVnd).toBe("558800000");
    expect(built.taxes.importDutyVnd).toBe("2974906");
    // CV 2061: không tự điền MO – để trống, nghi ngờ và chặn phê duyệt đến khi người khai chọn MO/CU.
    // Hàng chương 84/85, mô tả không ghi đã qua sử dụng → MO (CV 2061/TCHQ-GSQL); người khai đổi CU nếu hàng cũ.
    expect(f("VBPQ")).toMatchObject({ no: "1.37", value: "MO", note: expect.stringMatching(/MO.*CV 2061.*CU/) });
    expect(f("VBPQ").blocking).toBe(true); // vẫn không cho để trống
    // Thiếu ngày vận đơn → số vận đơn đường biển chưa ghép được tiền tố DDMMYY.
    expect(f("SO_VD")).toMatchObject({ suspect: true, note: expect.stringMatching(/DDMMYY/) });
    expect(built.suspectCount).toBe(6); // TRONG_LUONG, KHO, PT_TT, SO_VD + CT_TG (thiếu ngày vận đơn), GHI_CHU (ngày C/O)
  });
  it("VBPQ xét HS đã xác nhận trước HS trên invoice: xác nhận 3926 cho mọi dòng → không cần MO/CU", () => {
    const items = ITEMS.map((it, k) => ({ ...it, lineNo: k + 1, hsConfirmed: "39269099" }));
    const b = buildDeclaration({ catalogs: CATALOGS, shipment: hansol(), dossier: DOSSIER, org: ORG, items, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(b.fields["VBPQ"]).toMatchObject({ value: "", source: "SYSTEM" });
    expect(b.fields["VBPQ"]?.blocking).toBeUndefined();
  });
  it("ghi chú vượt 100 ký tự (chỉ tiêu 1.68) → nghi ngờ, hướng dẫn khai phần còn lại qua HYS", () => {
    const many = hansol((s) => void (s.transport.containers = Array.from({ length: 8 }, (_, k) => ({ no: `HDMU123456${k}`, sealNo: null, size: "40HC" }))));
    const b = buildDeclaration({ catalogs: CATALOGS, shipment: many, dossier: DOSSIER, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(b.fields["GHI_CHU"]).toMatchObject({ suspect: true, note: expect.stringMatching(/vượt giới hạn 100 ký tự.*HYS/) });
  });
  it("POD nước ngoài → điểm đến cuối tại VN và đánh dấu nghi ngờ; EDA dùng buyer làm người nhập khẩu", () => {
    const sg = { value: "SINGAPORE", sources: [{ documentId: "doc_bl", kind: "BILL_OF_LADING" as const, page: 1, raw: "SINGAPORE", normalized: "SINGAPORE" }], status: "SINGLE_SOURCE" as const };
    const b2 = buildDeclaration({ catalogs: CATALOGS, shipment: hansol((s) => void (s.transport.portOfDischarge = sg)), dossier: DOSSIER, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(b2.fields["CANG_DO"]).toMatchObject({ value: "VNHPN – CANG TAN VU - HP", suspect: true, note: expect.stringMatching(/chuyển tải/) });
    const eda = buildDeclaration({ catalogs: CATALOGS, shipment: hansol(), dossier: { ...DOSSIER, direction: "XK", typeCode: "B11" }, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(eda.kind).toBe("EDA");
    expect(eda.fields["NXK_MST"]).toMatchObject({ no: "2.11", value: "0316789012", source: "ACCOUNT" });
    expect(eda.fields["NNK_TEN"]?.value).toBe("AN PHAT INDUSTRIAL EQUIPMENT CO., LTD");
    expect(eda.adjustments).toEqual([]);
  });
});

describe("lô FANS25040166 (đối chiếu TK 107139226350)", () => {
  const ref = (kind: "BILL_OF_LADING" | "ARRIVAL_NOTICE", raw: string) => ({ documentId: `doc_${kind}`, kind, page: 1, raw, normalized: raw });
  const fans = hansol((s) => {
    s.transport.portOfDischarge = { value: "HO CHI MINH, VIETNAM", sources: [ref("BILL_OF_LADING", "HO CHI MINH, VIETNAM"), ref("ARRIVAL_NOTICE", "CANG CAT LAI (HCM)")], status: "CONFLICT" };
    s.transport.finalDestination = { value: "HO CHI MINH, VIETNAM", sources: [ref("BILL_OF_LADING", "HO CHI MINH, VIETNAM")], status: "SINGLE_SOURCE" };
    s.transport.warehouseCode = { value: null, sources: [], status: "SINGLE_SOURCE" };
    s.transport.warehouseName = { value: "CÁT LÁI KHO 3", sources: [ref("ARRIVAL_NOTICE", "CÁT LÁI KHO 3")], status: "SINGLE_SOURCE" };
    s.transport.billNo = { value: "FANS25040166", sources: [ref("BILL_OF_LADING", "FANS25040166")], status: "SINGLE_SOURCE" };
    s.transport.departureDate = { value: "2025-04-22", sources: [ref("BILL_OF_LADING", "APR.22.2025")], status: "SINGLE_SOURCE" };
  });
  const catalogs = {
    ports: [{ code: "VNCLI", name: "CANG CAT LAI (HCM)", parent: "VN" }, { code: "VNSGN", name: "CANG SAI GON (HCM)", parent: "VN" }],
    warehouses: [{ code: "02CIRCI", name: "CCHQCK CANG SG KV I", parent: "02CI", note: "Địa điểm tập kết hàng do Chi cục HQ CK Cảng Sài Gòn KV I quản lý" }],
  };
  const b = buildDeclaration({ shipment: fans, dossier: { ...DOSSIER, customsOfficeCode: "02CI" }, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] }, catalogs });

  it("cảng dỡ theo Arrival Notice (VNCLI), kho = địa điểm tập kết của chi cục (02CIRCI, cần kiểm), số vận đơn DDMMYY + số", () => {
    expect(b.fields["CANG_DO"]).toMatchObject({ value: "VNCLI – CANG CAT LAI (HCM)", source: "ARRIVAL_NOTICE" });
    expect(b.fields["CANG_DO"]?.suspect).toBeUndefined();
    expect(b.fields["KHO"]).toMatchObject({ value: "02CIRCI – CCHQCK CANG SG KV I", source: "ARRIVAL_NOTICE", suspect: true, note: expect.stringMatching(/CÁT LÁI KHO 3.*02CI/) });
    expect(b.fields["SO_VD"]).toMatchObject({ value: "220425FANS25040166", source: "BILL_OF_LADING" });
    expect(b.fields["SO_VD"]?.suspect).toBeUndefined();
    expect(b.fields["CT_TG"]?.value).toBe("22042025#&PHƯƠNG THỨC THANH TOÁN TT");
  });
  it("không nạp danh mục: không đoán mã cảng (mã/tên chỉ lấy từ A016) – giữ chữ trên chứng từ, cần chọn; kho chỉ có tên → cần chọn mã", () => {
    const plain = buildDeclaration({ shipment: fans, dossier: { ...DOSSIER, customsOfficeCode: "02CI" }, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] } });
    expect(plain.fields["CANG_DO"]).toMatchObject({ value: "HO CHI MINH, VIETNAM", suspect: true });
    expect(plain.fields["KHO"]).toMatchObject({ value: "CÁT LÁI KHO 3", suspect: true });
  });
});

describe("lô chuyển phát nhanh 770471184612 (FedEx, đối chiếu TK 106794645160)", () => {
  type Kind = "AIR_WAYBILL" | "CERT_OF_ORIGIN" | "FREIGHT_INVOICE" | "INVOICE";
  const src = (kind: Kind, raw: string, status: "SINGLE_SOURCE" | "CROSS_CHECKED" = "SINGLE_SOURCE") => ({ value: raw, sources: [{ documentId: `doc_${kind}`, kind, page: 1, raw, normalized: raw }], status });
  const none = { value: null, sources: [], status: "SINGLE_SOURCE" as const };
  const lot = hansol((s) => {
    s.transport.billNo = src("AIR_WAYBILL", "770471184612", "CROSS_CHECKED");
    s.transport.portOfLoading = none;
    s.transport.portOfDischarge = src("CERT_OF_ORIGIN", "HO CHI MINH , VIET NAM");
    s.transport.finalDestination = none;
    s.transport.arrivalDate = { ...src("FREIGHT_INVOICE", "06-Dec-2024"), value: "2024-12-06" };
    s.transport.departureDate = { ...src("CERT_OF_ORIGIN", "DEC.04,2024"), value: "2024-12-04" };
    s.transport.containers = [];
    s.parties.seller.address = src("INVOICE", "NO.591,JIN HE ROAD, HONG QI TOWN, JINWAN DISTRICT,ZHUHAI CITY.GUANGDONG , CHINA");
    s.parties.seller.country = src("INVOICE", "CN");
    s.origin.coForm = src("CERT_OF_ORIGIN", "E");
    s.origin.coNo = src("CERT_OF_ORIGIN", "E247079657380002");
    s.origin.coDate = { ...src("CERT_OF_ORIGIN", "DEC. 04, 2024"), value: "2024-12-04" };
  });
  const catalogs = CATALOGS;
  const b = buildDeclaration({ shipment: lot, dossier: { ...DOSSIER, transportMode: "AIR", customsOfficeCode: "02DS" }, org: ORG, items: ITEMS, now: NOW, exchange: { date: "2026-10-14", rates: { VND: "1", USD: "25176" }, missing: [] }, catalogs });

  it("số vận đơn không khoảng trắng; cảng dỡ: TK thật khai VNSGN nhưng mã này chưa có trong A016 → giữ chữ, cần chọn; cảng xếp CNZUH suy từ địa chỉ người xuất khẩu (cần kiểm)", () => {
    expect(b.fields["SO_VD"]).toMatchObject({ value: "770471184612" });
    expect(b.fields["CANG_DO"]).toMatchObject({ value: "HO CHI MINH , VIET NAM", suspect: true });
    expect(b.fields["CANG_XEP"]).toMatchObject({ value: "CNZUH – ZHUHAI", suspect: true, note: expect.stringMatching(/ZHUHAI/) });
  });
  it("ngày đến theo thông báo cước (cần kiểm); ghi chú có ngày cấp C/O như TK thật", () => {
    expect(b.fields["NGAY_DEN"]).toMatchObject({ value: "2024-12-06", source: "FREIGHT_INVOICE", suspect: true });
    expect(b.fields["GHI_CHU"]).toMatchObject({ value: "C/O mẫu E số: E247079657380002 (04/12/2024)" });
    expect(b.fields["GHI_CHU"]?.suspect).toBeUndefined();
  });
});

describe("chỉ tiêu bổ sung theo Phụ lục II (TT39, sửa đổi TT121)", () => {
  const EX = { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] };
  const XK = { ...DOSSIER, direction: "XK" as const, typeCode: "B11" };
  const build = (shipment = hansol(), dossier = DOSSIER, items = ITEMS, extra: Partial<BuildInput> = {}) => buildDeclaration({ catalogs: CATALOGS, shipment, dossier, org: ORG, items, now: NOW, exchange: EX, ...extra });
  const withDate = (s: Shipment) => void (s.transport.departureDate = { value: "2026-10-05", sources: [{ documentId: "doc_bl", kind: "BILL_OF_LADING", page: 1, raw: "05 OCT 2026", normalized: "2026-10-05" }], status: "SINGLE_SOURCE" });

  it("1.50 mở đầu bằng ngày vận đơn DDMMYYYY#&, ghi dòng hàng FOC; thiếu ngày vận đơn → nghi ngờ, không tự điền", () => {
    // Invoice HANSOL ghi T/T → 1.43 khai KC, phương thức thực tế ghi tại 1.50.
    expect(build(hansol(withDate)).fields["CT_TG"]).toMatchObject({ no: "1.50", value: "05102026#&PHƯƠNG THỨC THANH TOÁN TT", source: "BILL_OF_LADING" });
    const foc = build(hansol((s) => { withDate(s); s.items[2]!.amount = { value: "0", sources: [], status: "SINGLE_SOURCE" }; })).fields["CT_TG"];
    expect(foc?.value).toBe("05102026#&Dòng hàng 3 là hàng không thanh toán (FOC/khuyến mại); PHƯƠNG THỨC THANH TOÁN TT");
    const lc = build(hansol((s) => { withDate(s); s.invoice.paymentTerms = { value: "L/C at sight", sources: [], status: "SINGLE_SOURCE" }; })).fields["CT_TG"];
    expect(lc?.value).toBe("05102026#&");
    expect(build().fields["CT_TG"]).toMatchObject({ value: "PHƯƠNG THỨC THANH TOÁN TT", suspect: true, note: expect.stringMatching(/ngày vận đơn/) });
  });

  it("1.38 / 2.33 giấy phép: người khai nhập; loại hình gia công (E21, E52) → nghi ngờ, nhắc khai số tiếp nhận hợp đồng gia công", () => {
    expect(build().fields["GP"]).toMatchObject({ no: "1.38", value: "" });
    expect(build().fields["GP"]?.suspect).toBeUndefined();
    expect(build(hansol(), { ...DOSSIER, typeCode: "E21" }).fields["GP"]).toMatchObject({ suspect: true, note: expect.stringMatching(/số tiếp nhận hợp đồng/) });
    expect(build(hansol(), { ...XK, typeCode: "E52" }).fields["GP"]).toMatchObject({ no: "2.33", suspect: true });
  });

  it("EDA không ước tính thuế bằng thuế suất nhập khẩu: thuế XK và GTGT dự kiến = 0", () => {
    const eda = build(hansol(), XK);
    expect(eda.taxes).toMatchObject({ importDutyVnd: "0", vatVnd: "0" });
    expect(build().taxes.importDutyVnd).not.toBe("0");
  });

  it("EDA CIF: trừ cước và bảo hiểm quốc tế khỏi trị giá; 2.40 = giá hóa đơn − cước − bảo hiểm (cùng tiền tệ)", () => {
    const cif = build(hansol((s) => {
      s.invoice.incoterm = { value: "CIF", sources: [], status: "SINGLE_SOURCE" };
      s.charges.insurance = { value: "40", sources: [], status: "SINGLE_SOURCE" };
    }), XK);
    expect(cif.adjustments.map((a) => `${a.label}:${a.kind}:${a.amount}`)).toEqual(["Cước vận chuyển quốc tế:SUBTRACT:1150", "Phí bảo hiểm:SUBTRACT:40"]);
    expect(cif.valuation.customsValueVnd).toBe(String((20850 - 1150 - 40) * 25400));
    expect(cif.fields["TG_TT"]).toMatchObject({ no: "2.40", value: "19660 USD", note: expect.stringMatching(/Đã trừ/) });
    expect(cif.fields["TG_TT"]?.suspect).toBeUndefined();
  });

  it("EDA CFR chưa có số cước → không trừ bừa: không lý do thì 2.40 để trống và chặn duyệt, có lý do thì cảnh báo; FOB → không khai 2.40", () => {
    const tweak = (s: Shipment) => {
      s.invoice.incoterm = { value: "CFR", sources: [], status: "SINGLE_SOURCE" };
      s.charges.freight = { value: null, sources: [], status: "SINGLE_SOURCE" };
    };
    const cfr = build(hansol(tweak), XK);
    expect(cfr.adjustments).toEqual([]);
    expect(cfr.fields["TG_TT"]).toMatchObject({ value: "", suspect: true, blocking: true, note: expect.stringMatching(/cần số cước/) });
    const withReason = build(hansol(tweak), XK, ITEMS, { charges: { ...EMPTY_VALUE_CHARGES, freight: { amount: null, currency: null, reason: "INVOICE_LATER", note: "" } } });
    expect(withReason.fields["TG_TT"]).toMatchObject({ value: "20850 USD", suspect: true, note: expect.stringMatching(/Hóa đơn cước bổ sung sau/) });
    expect(withReason.fields["TG_TT"]?.blocking).toBeUndefined();
    const fob = build(hansol((s) => void (s.invoice.incoterm = { value: "FOB", sources: [], status: "SINGLE_SOURCE" })), XK);
    expect(fob.fields["TG_TT"]).toBeUndefined(); // FOB: chỉ tiêu 2.40 không áp dụng → không có ô
    expect(fob.hidden).toContain("TG_TT");
  });

  it("1.47 FOB không có cước: không lý do → chặn duyệt; có lý do → cảnh báo, không chặn; nhập tay lệch chứng từ → nghi ngờ", () => {
    const fob = (s: Shipment) => {
      s.invoice.incoterm = { value: "FOB", sources: [], status: "SINGLE_SOURCE" };
      s.charges.freight = { value: null, sources: [], status: "SINGLE_SOURCE" };
    };
    const blocked = build(hansol(fob));
    expect(blocked.fields["PHI_VC"]).toMatchObject({ value: "", blocking: true, suspect: true });
    expect(missingBlockingFields(blocked.fields).map((f) => f.no)).toContain("1.47");
    const reason = build(hansol(fob), DOSSIER, ITEMS, { charges: { ...EMPTY_VALUE_CHARGES, freight: { amount: null, currency: null, reason: "INVOICE_LATER", note: "" } } });
    expect(reason.fields["PHI_VC"]).toMatchObject({ value: "", source: "USER", suspect: true, note: expect.stringMatching(/Hóa đơn cước bổ sung sau/) });
    expect(missingBlockingFields(reason.fields).map((f) => f.no)).not.toContain("1.47");
    const differs = build(hansol((s) => void (s.invoice.incoterm.value = "FOB")), DOSSIER, ITEMS, { charges: { ...EMPTY_VALUE_CHARGES, freight: { amount: "1300", currency: "USD", reason: "CONTRACT", note: "" } } });
    expect(differs.fields["PHI_VC"]).toMatchObject({ value: "1300 USD", source: "USER", suspect: true, note: expect.stringMatching(/Khác số trên chứng từ: 1150 USD/) });
  });

  it("1.48 không mua bảo hiểm → mã D; 1.49 khoản điều chỉnh có mã → từng khoản dạng mã AD/SB trị giá mã tiền", () => {
    const c: ValueCharges = { freight: null, insurance: { mode: "NONE" }, adjustments: [{ code: "A", kind: "AD", amount: "100", currency: "USD", note: "", allocate: true }, { code: "G", kind: "SB", amount: "20", currency: "USD", note: "", allocate: true }] };
    const b = build(hansol(), DOSSIER, ITEMS, { charges: c });
    expect(b.fields["PHI_BH"]).toMatchObject({ value: NO_INSURANCE_VALUE, source: "USER" });
    expect(b.fields["KHOAN_DC"]).toMatchObject({ value: "A AD 100 USD; G SB 20 USD", source: "USER" });
    expect(b.fields["KHOAN_DC"]?.suspect).toBeUndefined();
    const ocrOther = build(hansol((s) => void (s.charges.other = [{ label: "Royalty", amount: "40", currency: "USD", sourceKind: "INVOICE" }])));
    expect(ocrOther.fields["KHOAN_DC"]).toMatchObject({ suspect: true, note: expect.stringMatching(/chưa có mã tên khoản điều chỉnh/) });
  });

  it("EDA 2.43 người nộp thuế mặc định 1, theo Mặc định khai báo nếu có; 2.80 để người khai nhập", () => {
    expect(build(hansol(), XK).fields["NGUOI_NT"]).toMatchObject({ no: "2.43", value: "1 – Người xuất khẩu" });
    const withProfile = buildDeclaration({ catalogs: CATALOGS, shipment: hansol(), dossier: XK, org: ORG, items: ITEMS, now: NOW, exchange: EX, profile: { NGUOI_NT: "2 – Đại lý hải quan" } });
    expect(withProfile.fields["NGUOI_NT"]?.value).toBe("2 – Đại lý hải quan");
    expect(build(hansol(), XK).fields["VBPQ"]).toMatchObject({ no: "2.80", value: "" });
  });
});

describe("chỉ tiêu theo tình huống (bật/tắt theo loại hình, phương thức vận chuyển, điều kiện giá)", () => {
  const EX = { date: "2026-10-14", rates: { VND: "1", USD: "25400" }, missing: [] };
  const build = (dossier: typeof DOSSIER, shipment = hansol()) => buildDeclaration({ catalogs: CATALOGS, shipment, dossier, org: ORG, items: ITEMS, now: NOW, exchange: EX });
  const codes = (b: ReturnType<typeof build>) => Object.keys(b.fields);

  it("A11 đường biển container: không có 1.3/1.10; có hô hiệu 1.31 (điền sẵn 9999) và số lượng container 1.35 kèm lý do hiện", () => {
    const b = build(DOSSIER);
    expect(codes(b)).not.toContain("HAN_TX");
    expect(codes(b)).not.toContain("TNTX_TK");
    expect(b.hidden).toEqual(expect.arrayContaining(["HAN_TX", "TNTX_TK"]));
    expect(b.fields["SL_CONT"]).toMatchObject({ no: "1.35", value: "1", condition: expect.stringMatching(/container/) });
    expect(b.fields["HO_HIEU"]).toMatchObject({ no: "1.31", value: "9999", source: "DEFAULT", condition: expect.stringMatching(/đường biển/) });
    expect(b.fields["HO_HIEU"]?.suspect).toBeUndefined();
  });

  it("tạm nhập G12 → 1.10 bắt buộc (thiếu → nghi ngờ); tái nhập G51 → 1.3", () => {
    expect(build({ ...DOSSIER, typeCode: "G12" }).fields["HAN_TX"]).toMatchObject({ no: "1.10", suspect: true, condition: expect.stringMatching(/tạm nhập/) });
    const g51 = build({ ...DOSSIER, typeCode: "G51" });
    expect(g51.fields["TNTX_TK"]).toMatchObject({ no: "1.3", suspect: true });
    expect(codes(g51)).not.toContain("HAN_TX");
  });

  it("chặn phê duyệt chỉ xét chỉ tiêu tình huống khi có trên tờ khai: A11 không đòi 1.10; G12 đòi 1.10", () => {
    expect(missingRequiredFields("IDA", build(DOSSIER).fields).map((m) => m.code)).not.toContain("HAN_TX");
    expect(missingRequiredFields("IDA", build({ ...DOSSIER, typeCode: "G12" }).fields).map((m) => m.code)).toContain("HAN_TX");
  });

  it("đường hàng không → không có hô hiệu, số lượng container", () => {
    const air = build({ ...DOSSIER, transportMode: "AIR" }, hansol((s) => void (s.transport.containers = [])));
    expect(codes(air)).not.toContain("HO_HIEU");
    expect(codes(air)).not.toContain("SL_CONT");
  });

  it("EDA: tái xuất G21 → 2.3; tạm xuất G61 → 2.7; container → 2.60; FOB → không có 2.40", () => {
    const XK = { ...DOSSIER, direction: "XK" as const };
    expect(build({ ...XK, typeCode: "G21" }).fields["TNTX_TK"]).toMatchObject({ no: "2.3", suspect: true });
    expect(build({ ...XK, typeCode: "G61" }).fields["HAN_TN"]).toMatchObject({ no: "2.7", suspect: true });
    const b11 = build({ ...XK, typeCode: "B11" }, hansol((s) => void (s.invoice.incoterm = { value: "FOB", sources: [], status: "SINGLE_SOURCE" })));
    expect(b11.fields["SO_CONT"]).toMatchObject({ no: "2.60", value: "SITU2246781" });
    expect(codes(b11)).not.toContain("TG_TT");
    expect(codes(b11)).not.toContain("HAN_TN");
  });
});
