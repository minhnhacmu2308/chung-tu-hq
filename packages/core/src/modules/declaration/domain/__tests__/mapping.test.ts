import type { Shipment, Sourced } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { buildDeclaration } from "../build.js";
import { DOSSIER, hansol, ORG } from "../test/shipment.js";
import type { DossierInfo, OrgInfo } from "../types.js";

const NOW = new Date("2026-10-14T03:00:00.000Z");
const ITEMS = ["3700", "3360", "2700", "2760", "3900", "2952", "1478"].map((amount, i) => ({ id: `li_${i + 1}`, amount, importDutyRate: "0", vatRate: "8" }));
const RATES = { VND: "1", USD: "25400" };
const nul = (): Sourced<string> => ({ value: null, sources: [], status: "SINGLE_SOURCE" });
const val = (value: string): Sourced<string> => ({ value, sources: [], status: "SINGLE_SOURCE" });

type Opts = { mutate?: (s: Shipment) => void; dossier?: Partial<DossierInfo>; org?: Partial<OrgInfo>; rates?: Record<string, string> };
const build = (direction: "NK" | "XK", o: Opts = {}) =>
  buildDeclaration({
    shipment: hansol(o.mutate), dossier: { ...DOSSIER, direction, typeCode: direction === "NK" ? "A11" : "B11", ...o.dossier }, org: { ...ORG, ...o.org }, items: ITEMS, now: NOW,
    exchange: { date: "2026-10-14", rates: o.rates ?? RATES, missing: [] },
  }).fields;
const ida = (o?: Opts) => build("NK", o);
const eda = (o?: Opts) => build("XK", o);

describe("EDA_MAPPINGS (tờ khai xuất khẩu)", () => {
  it("số tờ khai đã cấp, tên chi cục rỗng → chỉ mã chi cục; ghi chú từ hồ sơ", () => {
    const f = eda({ dossier: { declarationNo: "305123456789", customsOfficeName: "", note: "Hàng mẫu" } });
    expect(f["SOTK"]).toMatchObject({ value: "305123456789", source: "SYSTEM" });
    expect(f["CQHQ"]?.value).toBe("03CE");
    expect(f["GHI_CHU"]).toMatchObject({ value: "Hàng mẫu", source: "DOSSIER" });
  });

  it("số tờ khai chưa cấp → ghi chú nhận sau khi truyền EDA; có tên chi cục → “mã – tên”", () => {
    const f = eda();
    expect(f["SOTK"]?.value).toMatch(/Chưa cấp.*EDA/);
    expect(f["CQHQ"]?.value).toBe("03CE – Chi cục HQ CK cảng Hải Phòng KV III");
    expect(f["GHI_CHU"]?.value).toBe("");
  });

  it("doanh nghiệp chưa có địa chỉ/điện thoại → địa chỉ nghi ngờ kèm hướng dẫn, điện thoại để trống", () => {
    const f = eda({ org: { address: "", phone: "" } });
    expect(f["NXK_DC"]).toMatchObject({ value: "", source: "ACCOUNT", suspect: true, note: "Cập nhật địa chỉ doanh nghiệp ở Tài khoản" });
    expect(f["NXK_DT"]).toMatchObject({ value: "" });
    expect(f["NXK_DT"]?.suspect).toBeUndefined();
  });

  it("thiếu số vận đơn → lấy vận đơn chủ; thiếu cả hai → để trống, không nghi ngờ (bổ sung sau)", () => {
    expect(eda({ mutate: (s) => void (s.transport.billNo = nul()) })["SO_VD"]?.value).toBe("SITCHPH2610441");
    const none = eda({ mutate: (s) => { s.transport.billNo = nul(); s.transport.masterBillNo = nul(); } })["SO_VD"];
    expect(none).toMatchObject({ value: "", source: "BILL_OF_LADING", note: expect.stringMatching(/booking/) });
    expect(none?.suspect).toBeUndefined();
  });

  it("số kiện: thiếu → nghi ngờ; không có đơn vị → mặc định PK", () => {
    expect(eda({ mutate: (s) => void (s.transport.packages = nul()) })["SO_KIEN"]).toMatchObject({ value: "", suspect: true, note: "Chưa có số kiện trên Packing List" });
    expect(eda({ mutate: (s) => void (s.transport.packageUnit = nul()) })["SO_KIEN"]?.value).toBe("48 PK");
  });

  it("trọng lượng: thiếu → nghi ngờ; số có 0 thừa → rút gọn", () => {
    expect(eda({ mutate: (s) => void (s.transport.grossWeightKg = nul()) })["TRONG_LUONG"]).toMatchObject({ value: "", suspect: true, note: "Chưa có tổng trọng lượng" });
    expect(eda({ mutate: (s) => void (s.transport.grossWeightKg = val("3860.500000")) })["TRONG_LUONG"]?.value).toBe("3860.5");
  });

  it("kho hàng xuất luôn cần người khai chọn", () => {
    expect(eda()["KHO"]).toMatchObject({ value: "", source: "DOSSIER", suspect: true });
  });

  it("địa điểm nhận hàng cuối: tra được mã; không tra được → giữ nguyên chữ, nghi ngờ; thiếu → nghi ngờ", () => {
    expect(eda()["CANG_DO"]?.value).toBe("VNHPH – Cảng Hải Phòng");
    expect(eda({ mutate: (s) => void (s.transport.portOfDischarge = val("MOMBASA, KENYA")) })["CANG_DO"]).toMatchObject({ value: "MOMBASA, KENYA", suspect: true, note: expect.stringMatching(/Không tìm thấy mã VNACCS/) });
    expect(eda({ mutate: (s) => void (s.transport.portOfDischarge = nul()) })["CANG_DO"]).toMatchObject({ value: "", suspect: true, note: "Chưa có địa điểm trên chứng từ" });
  });

  it("địa điểm xếp hàng: thiếu → mặc định cảng Hải Phòng (nguồn DEFAULT); tra được → mã theo chứng từ", () => {
    expect(eda({ mutate: (s) => void (s.transport.portOfLoading = nul()) })["CANG_XEP"]).toMatchObject({ value: "VNHPH – Cảng Hải Phòng", source: "DEFAULT", note: expect.stringMatching(/Mặc định cảng Hải Phòng/) });
    expect(eda()["CANG_XEP"]).toMatchObject({ value: "KRPUS – Busan", source: "BILL_OF_LADING" });
  });

  // Nghi lỗi (báo cáo, chưa sửa): eda.ts CANG_XEP dùng `resolvePort(pol) ?? resolvePort("HAIPHONG")` – cảng có trên chứng từ
  // nhưng không tra được mã (vd "CAI LAN, QUANG NINH") bị thay im lặng bằng Hải Phòng, không nghi ngờ, nguồn vẫn ghi BILL_OF_LADING.
  it("địa điểm xếp hàng có trên chứng từ nhưng không tra được mã → giữ chữ gốc và đánh dấu nghi ngờ (không tự thay bằng Hải Phòng)", () => {
    expect(eda({ mutate: (s) => void (s.transport.portOfLoading = val("CAI LAN, QUANG NINH")) })["CANG_XEP"]).toMatchObject({ value: "CAI LAN, QUANG NINH", suspect: true, note: expect.stringMatching(/Không tìm thấy mã VNACCS/) });
  });

  it("tên phương tiện: thiếu → để trống kèm ghi chú (không bắt buộc); có → giữ nguyên, không ghép số chuyến", () => {
    expect(eda({ mutate: (s) => void (s.transport.vessel = nul()) })["PTVC_TEN"]).toMatchObject({ value: "", note: "Bổ sung khi có booking" });
    expect(eda()["PTVC_TEN"]?.value).toBe("SITC HAIPHONG");
  });

  it("phương thức thanh toán: L/C → mã LC; thiếu → nghi ngờ", () => {
    expect(eda({ mutate: (s) => void (s.invoice.paymentTerms = val("L/C at sight")) })["PT_TT"]).toMatchObject({ value: "LC – Thư tín dụng (L/C)" });
    expect(eda({ mutate: (s) => void (s.invoice.paymentTerms = nul()) })["PT_TT"]).toMatchObject({ value: "", suspect: true, note: "Chưa có phương thức thanh toán" });
  });

  it("điều kiện giá viết hoa; thiếu tổng trị giá → tính từ tổng các dòng", () => {
    expect(eda({ mutate: (s) => void (s.invoice.incoterm = val("fob")) })["DK_GIA"]?.value).toBe("FOB");
    expect(eda({ mutate: (s) => void (s.invoice.totalAmount = nul()) })["TONG_TG"]).toMatchObject({ value: "20850", source: "SYSTEM", note: "Tính từ tổng các dòng hàng" });
  });

  it("tỷ giá: thiếu tiền tệ hóa đơn → theo tiền tệ hồ sơ; chưa có tỷ giá → nghi ngờ", () => {
    expect(eda({ mutate: (s) => void (s.invoice.currency = nul()) })["TY_GIA"]?.value).toBe("25400");
    expect(eda({ rates: { VND: "1" } })["TY_GIA"]).toMatchObject({ value: "", suspect: true, note: "Chưa có tỷ giá tính thuế cho USD" });
  });

  it.each([["AIR", false, "1 – Đường hàng không"], ["ROAD", false, "4 – Đường bộ"], ["SEA", true, "2 – Đường biển (container)"], ["SEA", false, "3 – Đường biển (hàng rời)"]] as const)(
    "phương thức vận chuyển %s (container: %s) → %s",
    (mode, hasContainers, expected) => {
      const f = eda({ dossier: { transportMode: mode }, mutate: (s) => void (s.transport.containers = hasContainers ? s.transport.containers : []) });
      expect(f["PTVC"]?.value).toBe(expected);
    },
  );
});

describe("IDA_MAPPINGS (tờ khai nhập khẩu)", () => {
  it("địa chỉ doanh nghiệp rỗng → nghi ngờ; điện thoại rỗng → để trống", () => {
    const f = ida({ org: { address: "", phone: "" } });
    expect(f["NNK_DC"]).toMatchObject({ value: "", suspect: true, note: "Cập nhật địa chỉ doanh nghiệp ở Tài khoản" });
    expect(f["NNK_DT"]?.value).toBe("");
  });

  it("vận đơn: thiếu số B/L → dùng MAWB/master; thiếu cả hai → nghi ngờ (bắt buộc)", () => {
    expect(ida({ mutate: (s) => void (s.transport.billNo = nul()) })["SO_VD"]?.value).toBe("SITCHPH2610441");
    expect(ida({ mutate: (s) => { s.transport.billNo = nul(); s.transport.masterBillNo = nul(); } })["SO_VD"]).toMatchObject({ value: "", suspect: true, note: expect.stringMatching(/Chưa có vận đơn/) });
  });

  it("số kiện / trọng lượng thiếu → nghi ngờ; không có đơn vị kiện → PK", () => {
    expect(ida({ mutate: (s) => void (s.transport.packages = nul()) })["SO_KIEN"]?.suspect).toBe(true);
    expect(ida({ mutate: (s) => void (s.transport.packageUnit = nul()) })["SO_KIEN"]?.value).toBe("48 PK");
    expect(ida({ mutate: (s) => void (s.transport.grossWeightKg = nul()) })["TRONG_LUONG"]).toMatchObject({ value: "", suspect: true });
  });

  it("cảng xếp không tra được mã → giữ chữ, nghi ngờ; thiếu → nghi ngờ", () => {
    expect(ida({ mutate: (s) => void (s.transport.portOfLoading = val("MOMBASA")) })["CANG_XEP"]).toMatchObject({ value: "MOMBASA", suspect: true });
    expect(ida({ mutate: (s) => void (s.transport.portOfLoading = nul()) })["CANG_XEP"]).toMatchObject({ value: "", suspect: true, note: "Chưa có địa điểm trên chứng từ" });
  });

  it("cảng dỡ nước ngoài, điểm đến cuối không phải VN → giữ mã cảng nước ngoài kèm cảnh báo", () => {
    const f = ida({ mutate: (s) => { s.transport.portOfDischarge = val("SINGAPORE"); s.transport.finalDestination = val("SINGAPORE"); } });
    expect(f["CANG_DO"]).toMatchObject({ value: "SGSIN – Singapore", suspect: true, note: expect.stringMatching(/không phải cảng Việt Nam/) });
  });

  it("tên phương tiện: không có số chuyến → chỉ tên tàu; thiếu tên tàu → nghi ngờ", () => {
    expect(ida({ mutate: (s) => void (s.transport.voyage = nul()) })["PTVC_TEN"]?.value).toBe("SITC HAIPHONG");
    expect(ida({ mutate: (s) => void (s.transport.vessel = nul()) })["PTVC_TEN"]).toMatchObject({ value: "", suspect: true, note: "Chưa có tên tàu / chuyến bay" });
  });

  it("ngày hàng đến: có → nguồn Arrival Notice; thiếu → nghi ngờ", () => {
    expect(ida()["NGAY_DEN"]).toMatchObject({ value: "2026-10-15", source: "ARRIVAL_NOTICE" });
    expect(ida({ mutate: (s) => void (s.transport.arrivalDate = nul()) })["NGAY_DEN"]).toMatchObject({ value: "", source: "ARRIVAL_NOTICE", suspect: true });
  });

  it("thanh toán thiếu → nghi ngờ; tổng trị giá thiếu → tính từ dòng hàng", () => {
    expect(ida({ mutate: (s) => void (s.invoice.paymentTerms = nul()) })["PT_TT"]).toMatchObject({ value: "", suspect: true });
    expect(ida({ mutate: (s) => void (s.invoice.totalAmount = nul()) })["TONG_TG"]).toMatchObject({ value: "20850", source: "SYSTEM" });
  });

  it("phí vận chuyển: CIF → để trống “đã gồm trong giá”, không nghi ngờ", () => {
    const f = ida({ mutate: (s) => void (s.invoice.incoterm = val("CIF")) });
    expect(f["PHI_VC"]).toMatchObject({ value: "", source: "SYSTEM", note: "Đã gồm trong giá hóa đơn" });
    expect(f["PHI_VC"]?.suspect).toBeUndefined();
  });

  it("phí vận chuyển: FCA thiếu cước → nghi ngờ, cần hóa đơn cước", () => {
    expect(ida({ mutate: (s) => void (s.charges.freight = nul()) })["PHI_VC"]).toMatchObject({ value: "", suspect: true, note: expect.stringMatching(/^FCA: cần cước/) });
  });

  it("phí vận chuyển bằng tiền tệ chưa có tỷ giá → nghi ngờ “chưa có tỷ giá”", () => {
    const f = ida({ mutate: (s) => void (s.charges.freightCurrency = val("EUR")) });
    expect(f["PHI_VC"]).toMatchObject({ value: "1150 EUR", suspect: true, note: "Chưa có tỷ giá cho EUR" });
  });

  it("phí bảo hiểm FOB → có giá trị; khoản điều chỉnh khác liệt kê nhãn, số tiền, nguồn đầu tiên", () => {
    const f = ida({ mutate: (s) => {
      s.invoice.incoterm = val("FOB");
      s.charges.insurance = { value: "35", sources: [{ documentId: "doc_invoice", kind: "INVOICE", page: 1, raw: "35", normalized: "35" }], status: "SINGLE_SOURCE" };
      s.charges.other = [{ label: "Royalty", amount: "500", currency: "USD", sourceKind: "SALES_CONTRACT" }, { label: "Assist", amount: "200", currency: "USD", sourceKind: "INVOICE" }];
    } });
    expect(f["PHI_BH"]).toMatchObject({ value: "35 USD", source: "INVOICE" });
    expect(f["KHOAN_DC"]).toMatchObject({ value: "Royalty: 500 USD; Assist: 200 USD", source: "CONTRACT" });
  });

  it("không có khoản điều chỉnh khác → để trống", () => {
    expect(ida()["KHOAN_DC"]).toMatchObject({ value: "", source: "SYSTEM" });
  });

  it("tỷ giá chưa có → nghi ngờ, hướng dẫn nhập ở Quản trị hệ thống", () => {
    expect(ida({ rates: { VND: "1" } })["TY_GIA"]).toMatchObject({ value: "", suspect: true, note: expect.stringMatching(/Quản trị hệ thống/) });
  });

  it("C/O: REX (EVFTA) ưu tiên; C/O không ghi form → chỉ số C/O; không có → ghi chú áp MFN", () => {
    expect(ida({ mutate: (s) => void (s.origin.rexNo = val("DEREX12345")) })["SO_CO"]?.value).toBe("REX DEREX12345 (tự chứng nhận EVFTA)");
    expect(ida({ mutate: (s) => void (s.origin.coForm = nul()) })["SO_CO"]?.value).toBe("KR2610-0457-AK");
    expect(ida({ mutate: (s) => void (s.origin.coNo = nul()) })["SO_CO"]).toMatchObject({ value: "", source: "CERT_OF_ORIGIN", note: "Không có C/O – áp thuế suất MFN" });
  });

  it("không có dòng chương 84/85 → không cần mã văn bản pháp quy", () => {
    const f = ida({ mutate: (s) => void s.items.forEach((it) => void (it.hsOnInvoice = val("3926.90.99"))) });
    expect(f["VBPQ"]).toMatchObject({ value: "", source: "SYSTEM" });
    expect(f["VBPQ"]?.suspect).toBeUndefined();
  });

  it("ghi chú: không container + có ghi chú hồ sơ → chỉ ghi chú; không có gì → trống; có cả hai → nối bằng dấu chấm", () => {
    expect(ida({ mutate: (s) => void (s.transport.containers = []), dossier: { note: "Hàng mẫu" } })["GHI_CHU"]?.value).toBe("Hàng mẫu");
    expect(ida({ mutate: (s) => void (s.transport.containers = []) })["GHI_CHU"]?.value).toBe("");
    expect(ida({ dossier: { note: "Hàng mẫu" } })["GHI_CHU"]?.value).toBe("Container: SITU2246781. Hàng mẫu");
  });

  it("số tờ khai đã cấp → hiện số; tên chi cục rỗng → chỉ mã", () => {
    const f = ida({ dossier: { declarationNo: "105123456789", customsOfficeName: "" } });
    expect(f["SOTK"]?.value).toBe("105123456789");
    expect(f["CQHQ"]?.value).toBe("03CE");
  });

  // Nghi lỗi (báo cáo, chưa sửa): resolvePort so khớp alias bằng `includes`, alias "HAN" của Nội Bài đứng trước Shanghai
  // → "SHANGHAI, CHINA" ra VNHAN (Sân bay Nội Bài). Ở IDA, cảng xếp Thượng Hải bị khai thành Nội Bài.
  it("cảng xếp “SHANGHAI, CHINA” → CNSHA – Shanghai (không phải VNHAN – Nội Bài); “CHANGI” không khớp nhầm Nội Bài", () => {
    expect(ida({ mutate: (s) => void (s.transport.portOfLoading = val("SHANGHAI, CHINA")) })["CANG_XEP"]?.value).toBe("CNSHA – Shanghai");
    expect(ida({ mutate: (s) => void (s.transport.portOfLoading = val("CHANGI AIRPORT")) })["CANG_XEP"]).toMatchObject({ value: "CHANGI AIRPORT", suspect: true });
    expect(ida({ mutate: (s) => void (s.transport.portOfLoading = val("HAN, VIETNAM")) })["CANG_XEP"]?.value).toBe("VNHAN – Sân bay Nội Bài (Hà Nội)");
  });
});
