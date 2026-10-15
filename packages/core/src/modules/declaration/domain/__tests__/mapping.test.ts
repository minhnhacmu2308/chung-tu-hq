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

  it("2.24 là số quản lý hàng hóa (Mẫu 14), không lấy số B/L/booking: để trống, bắt buộc, ghi chú nhắc không khai số vận đơn", () => {
    expect(eda()["SO_VD"]).toMatchObject({ value: "", source: "DOSSIER", suspect: true, note: expect.stringMatching(/số quản lý hàng hóa.*HPSEL2610078/) });
    const none = eda({ mutate: (s) => { s.transport.billNo = nul(); s.transport.masterBillNo = nul(); } })["SO_VD"];
    expect(none).toMatchObject({ value: "", suspect: true });
    expect(none?.note).not.toMatch(/vận đơn\/booking/);
  });

  it("số kiện: thiếu → nghi ngờ; không có đơn vị → tạm PK và nghi ngờ; đơn vị lạ → tạm PK, nghi ngờ nêu chữ gốc", () => {
    expect(eda({ mutate: (s) => void (s.transport.packages = nul()) })["SO_KIEN"]).toMatchObject({ value: "", suspect: true, note: "Chưa có số kiện trên Packing List" });
    expect(eda({ mutate: (s) => void (s.transport.packageUnit = nul()) })["SO_KIEN"]).toMatchObject({ value: "48 PK", suspect: true, note: expect.stringMatching(/không ghi loại kiện/) });
    expect(eda({ mutate: (s) => void (s.transport.packageUnit = val("SKIDS")) })["SO_KIEN"]).toMatchObject({ value: "48 PK", suspect: true, note: expect.stringMatching(/SKIDS/) });
  });

  it("trọng lượng: thiếu → nghi ngờ; số có 0 thừa → rút gọn", () => {
    expect(eda({ mutate: (s) => void (s.transport.grossWeightKg = nul()) })["TRONG_LUONG"]).toMatchObject({ value: "", suspect: true, note: "Chưa có tổng trọng lượng" });
    expect(eda({ mutate: (s) => void (s.transport.grossWeightKg = val("3860.500000")) })["TRONG_LUONG"]?.value).toBe("3860.5");
  });

  it("kho hàng xuất luôn cần người khai chọn", () => {
    expect(eda()["KHO"]).toMatchObject({ value: "", source: "DOSSIER", suspect: true });
  });

  it("địa điểm nhận hàng cuối (2.28): ưu tiên điểm đến cuối; không có thì cảng dỡ; không tra được → giữ chữ, nghi ngờ; thiếu → nghi ngờ", () => {
    expect(eda({ mutate: (s) => void (s.transport.finalDestination = val("BUSAN CY, KOREA")) })["CANG_DO"]?.value).toBe("KRPUS – Busan");
    const noFd = (pod: ReturnType<typeof val> | ReturnType<typeof nul>) => eda({ mutate: (s) => { s.transport.finalDestination = nul(); s.transport.portOfDischarge = pod; } })["CANG_DO"];
    expect(noFd(val("BUSAN, KOREA"))?.value).toBe("KRPUS – Busan");
    expect(noFd(val("MOMBASA, KENYA"))).toMatchObject({ value: "MOMBASA, KENYA", suspect: true, note: expect.stringMatching(/Không tìm thấy mã VNACCS/) });
    expect(noFd(nul())).toMatchObject({ value: "", suspect: true, note: "Chưa có địa điểm trên chứng từ" });
  });

  it("địa điểm xếp hàng (2.29): bắt buộc, không tự điền Hải Phòng; tra được cảng VN → mã; cảng nước ngoài → nghi ngờ", () => {
    expect(eda({ mutate: (s) => void (s.transport.portOfLoading = nul()) })["CANG_XEP"]).toMatchObject({ value: "", suspect: true, note: expect.stringMatching(/bắt buộc \(chỉ tiêu 2.29\)/) });
    expect(eda({ mutate: (s) => void (s.transport.portOfLoading = val("CAT LAI, HCMC")) })["CANG_XEP"]).toMatchObject({ value: "VNCLI – Cảng Cát Lái (TP.HCM)", source: "BILL_OF_LADING" });
    expect(eda({ mutate: (s) => void (s.transport.portOfLoading = val("CAT LAI, HCMC")) })["CANG_XEP"]?.suspect).toBeUndefined();
    expect(eda()["CANG_XEP"]).toMatchObject({ value: "KRPUS – Busan", suspect: true, note: expect.stringMatching(/tại Việt Nam/) });
  });

  it("ngày hàng đi dự kiến (2.31): không lấy ngày hàng đến – để trống, bắt buộc", () => {
    expect(eda()["NGAY_DI"]).toMatchObject({ no: "2.31", value: "", suspect: true, note: expect.stringMatching(/ETD/) });
  });

  it("hình thức hóa đơn (2.34): 1 hóa đơn → A; nhiều hóa đơn → B kèm hướng dẫn bảng kê; không có → B", () => {
    expect(eda()["HD_PL"]).toMatchObject({ no: "2.34", value: "A – Hóa đơn thương mại" });
    const two = eda({ mutate: (s) => void s.documents.push({ id: "doc_inv2", kind: "INVOICE", pages: 1 }) })["HD_PL"];
    expect(two).toMatchObject({ value: expect.stringMatching(/^B/), suspect: true, note: expect.stringMatching(/2 hóa đơn.*HYS/) });
    expect(eda({ mutate: (s) => void (s.documents = s.documents.filter((d) => d.kind !== "INVOICE")) })["HD_PL"]?.value).toMatch(/^B/);
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

  it("phương thức thanh toán: L/C → mã LC; T/T → KC kèm hướng dẫn; thiếu → nghi ngờ", () => {
    expect(eda({ mutate: (s) => void (s.invoice.paymentTerms = val("L/C at sight")) })["PT_TT"]).toMatchObject({ value: "LC – Tín dụng thư (L/C)" });
    expect(eda({ mutate: (s) => void (s.invoice.paymentTerms = val("T/T in advance")) })["PT_TT"]).toMatchObject({ value: "KC – Khác (bao gồm cả TT)", note: expect.stringMatching(/T\/T in advance/) });
    expect(eda({ mutate: (s) => void (s.invoice.paymentTerms = nul()) })["PT_TT"]).toMatchObject({ value: "", suspect: true, note: "Chưa có phương thức thanh toán" });
  });

  it("điều kiện giá: chỉ lấy mã (bỏ địa danh), C&F/CNF chuẩn hóa; thiếu tổng trị giá → tính từ tổng các dòng", () => {
    expect(eda({ mutate: (s) => void (s.invoice.incoterm = val("fob")) })["DK_GIA"]?.value).toBe("FOB");
    expect(eda({ mutate: (s) => void (s.invoice.incoterm = val("FOB HAIPHONG")) })["DK_GIA"]?.value).toBe("FOB");
    expect(eda({ mutate: (s) => void (s.invoice.incoterm = val("CNF Busan")) })["DK_GIA"]?.value).toBe("C&F");
    expect(eda({ mutate: (s) => void (s.invoice.incoterm = val("C & I")) })["DK_GIA"]?.value).toBe("C&I");
    expect(eda({ mutate: (s) => void (s.invoice.totalAmount = nul()) })["TONG_TG"]).toMatchObject({ value: "20850", source: "SYSTEM", note: "Tính từ tổng các dòng hàng" });
  });

  it("điều kiện giá không có trong bảng mã → nghi ngờ; EDA không có DPU; IDA DPU hợp lệ kèm hướng dẫn DAT", () => {
    expect(eda({ mutate: (s) => void (s.invoice.incoterm = val("Franco")) })["DK_GIA"]).toMatchObject({ value: "FRANCO", suspect: true, note: expect.stringMatching(/không có trong bảng mã/) });
    expect(eda({ mutate: (s) => void (s.invoice.incoterm = val("DPU")) })["DK_GIA"]).toMatchObject({ value: "DPU", suspect: true, note: expect.stringMatching(/Mẫu 02.*không có mã DPU/) });
    const idaDpu = ida({ mutate: (s) => void (s.invoice.incoterm = val("DPU")) })["DK_GIA"];
    expect(idaDpu).toMatchObject({ value: "DPU", note: expect.stringMatching(/DAT/) });
    expect(idaDpu?.suspect).toBeUndefined();
  });

  it("mã phân loại giá: có dòng trị giá 0 (FOC) → C kèm số dòng; toàn bộ FOC → B; không có hóa đơn → EDA không khai", () => {
    expect(eda({ mutate: (s) => void (s.items[2]!.amount = val("0")) })["GIA_PL"]).toMatchObject({ value: expect.stringMatching(/^C/), suspect: true, note: expect.stringMatching(/Dòng 3.*2\.57/) });
    expect(eda({ mutate: (s) => s.items.forEach((it) => void (it.amount = val("0"))) })["GIA_PL"]?.value).toMatch(/^B/);
    expect(eda({ mutate: (s) => void (s.documents = s.documents.filter((d) => d.kind !== "INVOICE")) })["GIA_PL"]).toMatchObject({ value: "" });
  });

  it("tỷ giá: thiếu tiền tệ hóa đơn → theo tiền tệ hồ sơ; chưa có tỷ giá → nghi ngờ", () => {
    expect(eda({ mutate: (s) => void (s.invoice.currency = nul()) })["TY_GIA"]?.value).toBe("25400");
    expect(eda({ rates: { VND: "1" } })["TY_GIA"]).toMatchObject({ value: "", suspect: true, note: "Chưa có tỷ giá tính thuế cho USD" });
  });

  it.each([
    ["AIR", false, "1 – Đường hàng không"], ["SEA_CONTAINER", true, "2 – Đường biển (chứa trong container)"], ["SEA_BULK", false, "3 – Đường biển (không chứa trong container)"],
    ["ROAD", false, "4 – Đường bộ"], ["RAIL", false, "5 – Đường sắt"], ["RIVER", false, "6 – Đường sông"], ["OTHER", false, "9 – Khác"],
  ] as const)(
    "phương thức vận chuyển %s (container: %s) → %s",
    (mode, hasContainers, expected) => {
      const f = eda({ dossier: { transportMode: mode }, mutate: (s) => void (s.transport.containers = hasContainers ? s.transport.containers : []) });
      expect(f["PTVC"]?.value).toBe(expected);
      expect(f["PTVC"]?.suspect).toBeUndefined();
    },
  );

  it.each([["1", "1 – Cá nhân gửi cá nhân"], ["2", "2 – Tổ chức gửi cá nhân"], ["3", "3 – Cá nhân gửi tổ chức"], ["4", "4 – Tổ chức gửi tổ chức"], ["5", "5 – Khác"]] as const)(
    "IDA: phân loại cá nhân/tổ chức %s lấy từ hồ sơ → %s",
    (partyClass, expected) => expect(ida({ dossier: { partyClass } })["PL_CN"]).toMatchObject({ value: expected, source: "DOSSIER" }),
  );

  it("EDA không có chỉ tiêu phân loại cá nhân/tổ chức", () => {
    expect(eda({ dossier: { partyClass: "1" } })["PL_CN"]).toBeUndefined();
  });

  it("đường biển container nhưng vận đơn không có container → nghi ngờ, không tự đổi mã", () => {
    const f = eda({ dossier: { transportMode: "SEA_CONTAINER" }, mutate: (s) => void (s.transport.containers = []) });
    expect(f["PTVC"]).toMatchObject({ value: "2 – Đường biển (chứa trong container)", suspect: true });
  });
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

  it("ghi chú (1.68): C/O trước (TT121), rồi ghi chú hồ sơ, rồi container – ngăn cách bằng “;”; có C/O → nhắc bổ sung ngày cấp", () => {
    const noCo = (s: Shipment) => void (s.origin.coNo = nul());
    expect(ida({ mutate: (s) => { noCo(s); s.transport.containers = []; }, dossier: { note: "Hàng mẫu" } })["GHI_CHU"]?.value).toBe("Hàng mẫu");
    expect(ida({ mutate: (s) => { noCo(s); s.transport.containers = []; } })["GHI_CHU"]?.value).toBe("");
    expect(ida({ mutate: noCo })["GHI_CHU"]?.suspect).toBeUndefined();
    expect(ida({ dossier: { note: "Hàng mẫu" } })["GHI_CHU"]).toMatchObject({ value: "C/O form AK số KR2610-0457-AK; Hàng mẫu; Container: SITU2246781", suspect: true });
    expect(ida({ mutate: (s) => void (s.origin.rexNo = val("DEREX12345")) })["GHI_CHU"]?.value).toMatch(/^REX DEREX12345;/);
  });

  it("hình thức hóa đơn (1.39) và mã phân loại giá (1.44): không có hóa đơn → B và D", () => {
    const f = ida({ mutate: (s) => void (s.documents = s.documents.filter((d) => d.kind !== "INVOICE")) });
    expect(f["HD_PL"]?.value).toMatch(/^B/);
    expect(f["GIA_PL"]?.value).toMatch(/^D/);
  });

  it("phí bảo hiểm với điều kiện đã gồm bảo hiểm (C&I, DAT…) → không cộng (TT39 chỉ tiêu 1.48)", () => {
    const ins = (s: Shipment) => void (s.charges.insurance = { value: "35", sources: [{ documentId: "doc_invoice", kind: "INVOICE", page: 1, raw: "35", normalized: "35" }], status: "SINGLE_SOURCE" });
    for (const term of ["C&I", "DAT", "DDU", "DAF"]) expect(ida({ mutate: (s) => { ins(s); s.invoice.incoterm = val(term); } })["PHI_BH"]?.value, term).toBe("");
  });

  it("VBPQ: hàng chương 84/85 → để trống, nghi ngờ, chặn duyệt (không tự điền MO)", () => {
    expect(ida()["VBPQ"]).toMatchObject({ value: "", suspect: true, blocking: true, note: expect.stringMatching(/5 dòng chương 84\/85/) });
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
