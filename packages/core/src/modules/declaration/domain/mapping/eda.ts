// Mẫu 02 – tờ khai xuất khẩu (EDA). Người xuất khẩu = doanh nghiệp (tài khoản); người nhập khẩu = buyer trên invoice.
import { PORTS, resolvePort, transportModeCode } from "../catalog-resolve.js";
import { EDA_NO as N } from "./numbers.js";
import { incotermField, invoiceKind, packageCount, paymentMethod, port, priceKind } from "./shared.js";
import { profileSource, SRC } from "./sources.js";
import { fromSourced, missing, plainNumber, profileOr, vnDate, type FieldMapping } from "./types.js";

const isVn = (code: string | undefined) => PORTS.find((p) => p.code === code)?.country === "VN";

export const EDA_MAPPINGS: FieldMapping[] = [
  { code: "SOTK", no: N.SOTK, section: "GENERAL", label: "Số tờ khai", required: false, from: (i) => ({ value: i.dossier.declarationNo ?? "Chưa cấp – nhận sau khi truyền EDA", source: "SYSTEM" }) },
  { code: "MA_LH", no: N.MA_LH, section: "GENERAL", label: "Mã loại hình", required: true, from: (i) => ({ value: i.dossier.typeCode, source: "DOSSIER" }) },
  { code: "PTVC", no: N.PTVC, section: "GENERAL", label: "Mã phương thức vận chuyển", required: true, from: (i) => {
    const m = transportModeCode(i.dossier.transportMode, i.shipment.transport.containers.length > 0);
    return { value: `${m.code} – ${m.name}`, source: "DOSSIER", ...(m.note ? { suspect: true, note: m.note } : {}) };
  } },
  { code: "CQHQ", no: N.CQHQ, section: "GENERAL", label: "Mã cơ quan Hải quan", required: true, from: (i) => ({ value: i.dossier.customsOfficeName ? `${i.dossier.customsOfficeCode} – ${i.dossier.customsOfficeName}` : i.dossier.customsOfficeCode, source: "DOSSIER" }) },
  { code: "NGAY_DK", no: N.NGAY_DK, section: "GENERAL", label: "Ngày khai báo dự kiến", required: false, from: (i) => ({ value: vnDate(i.now), source: "SYSTEM" }) },

  { code: "NXK_MST", no: N.NXK_MST, section: "PARTIES", label: "Mã số thuế người xuất khẩu", required: true, from: (i) => ({ value: i.org.taxCode, source: "ACCOUNT" }) },
  { code: "NXK_TEN", no: N.NXK_TEN, section: "PARTIES", label: "Tên người xuất khẩu", required: true, from: (i) => ({ value: i.org.name, source: "ACCOUNT" }) },
  { code: "NXK_DC", no: N.NXK_DC, section: "PARTIES", label: "Địa chỉ người xuất khẩu", required: true, from: (i) => ({ value: i.org.address || null, source: "ACCOUNT", ...(i.org.address ? {} : { suspect: true, note: "Cập nhật địa chỉ doanh nghiệp ở Tài khoản" }) }) },
  { code: "NXK_DT", no: N.NXK_DT, section: "PARTIES", label: "Số điện thoại người xuất khẩu", required: false, from: (i) => ({ value: i.org.phone || null, source: "ACCOUNT" }) },
  { code: "NNK_TEN", no: N.NNK_TEN, section: "PARTIES", label: "Tên người nhập khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.buyer.name, "INVOICE") },
  { code: "NNK_DC", no: N.NNK_DC, section: "PARTIES", label: "Địa chỉ người nhập khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.buyer.address, "INVOICE") },
  { code: "MA_NUOC", no: N.MA_NUOC, section: "PARTIES", label: "Mã nước người nhập khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.buyer.country, "INVOICE") },

  // 2.24 là số quản lý hàng hóa do hệ thống cấp khi khai thông tin hàng hóa xuất khẩu (Mẫu 14), không phải số B/L (TT39 PL II; TT121 Đ.18 kh.1 đ.k):
  // mặc định để trống, nhắc nhập số quản lý hàng hóa. Doanh nghiệp vẫn có thể chọn lấy số vận đơn nhà/chủ ở Cài đặt → Khai báo (cấu hình riêng).
  { code: "SO_VD", no: N.SO_VD, section: "TRANSPORT", label: "Số vận đơn (số quản lý hàng hóa)", required: true, options: { sources: [SRC.houseBill, SRC.masterBill], allowFixed: false }, from: (i) => {
    const bl = i.shipment.transport.billNo.value ?? i.shipment.transport.masterBillNo.value;
    return missing("DOSSIER", `Nhập số quản lý hàng hóa do hệ thống cấp sau khi khai thông tin hàng hóa xuất khẩu${bl ? ` – không khai số vận đơn/booking ${bl} vào ô này` : ""} (chỉ tiêu 2.24)`);
  } },
  { code: "SO_KIEN", no: N.SO_KIEN, section: "TRANSPORT", label: "Số lượng kiện", required: true, from: (i) => packageCount(i, "Chưa có số kiện trên Packing List") },
  { code: "TRONG_LUONG", no: N.TRONG_LUONG, section: "TRANSPORT", label: "Tổng trọng lượng hàng (Gross)", required: true, from: (i) => {
    const g = fromSourced(i.shipment.transport.grossWeightKg, "PACKING_LIST");
    return g.value === null ? missing("PACKING_LIST", "Chưa có tổng trọng lượng") : { ...g, value: plainNumber(g.value) };
  } },
  { code: "KHO", no: N.KHO, section: "TRANSPORT", label: "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", required: true, options: { sources: [profileSource("KHO")], allowFixed: true }, from: (i) =>
    profileOr(i, "KHO", missing("DOSSIER", "Chọn mã địa điểm lưu kho / tập kết hàng xuất; dùng mã dùng chung của Chi cục (…OZZ) thì ghi địa điểm tập kết, thời gian đóng container, xếp hàng ở ô địa chỉ 2.59")) },
  // 2.28: nơi hàng được giao cuối cùng ở nước ngoài – ưu tiên điểm đến cuối (place of delivery), không có thì cảng dỡ.
  { code: "CANG_DO", no: N.CANG_DO, section: "TRANSPORT", label: "Địa điểm nhận hàng cuối cùng", required: true, from: (i) => {
    const fd = i.shipment.transport.finalDestination;
    const pod = i.shipment.transport.portOfDischarge;
    const fdPort = resolvePort(fd.value);
    if (fdPort) return port(fd.value, fdPort, fromSourced(fd, "BILL_OF_LADING").source);
    return port(pod.value, resolvePort(pod.value), fromSourced(pod, "BILL_OF_LADING").source);
  } },
  // 2.29: bắt buộc (trừ PTVC mã 9), là cảng/ICD/cửa khẩu/sân bay tại Việt Nam – không tự điền mặc định.
  { code: "CANG_XEP", no: N.CANG_XEP, section: "TRANSPORT", label: "Địa điểm xếp hàng", required: true, from: (i) => {
    const pol = i.shipment.transport.portOfLoading;
    const r = resolvePort(pol.value);
    const v = pol.value ? port(pol.value, r, fromSourced(pol, "BILL_OF_LADING").source) : missing("BILL_OF_LADING", "Chọn địa điểm xếp hàng tại Việt Nam (cảng, ICD, cửa khẩu, sân bay) – bắt buộc (chỉ tiêu 2.29)");
    return r && !isVn(r.code) ? { ...v, suspect: true, note: "Địa điểm xếp hàng của tờ khai xuất phải là địa điểm tại Việt Nam" } : v;
  } },
  { code: "PTVC_TEN", no: N.PTVC_TEN, section: "TRANSPORT", label: "Tên phương tiện vận chuyển", required: false, from: (i) => {
    const v = fromSourced(i.shipment.transport.vessel, "BILL_OF_LADING");
    return v.value === null ? { value: null, source: "BILL_OF_LADING", note: "Bổ sung khi có booking" } : v;
  } },
  // 2.31 (bắt buộc): ngày đi = ngày phát hành B/L / ngày bay / ngày đi trên C/O; không dùng ngày hàng đến (ETA).
  { code: "NGAY_DI", no: N.NGAY_DI, section: "TRANSPORT", label: "Ngày hàng đi dự kiến", required: true, options: { sources: [SRC.departureDate], allowFixed: true }, from: (i) => {
    const d = fromSourced(i.shipment.transport.departureDate, "BILL_OF_LADING");
    return d.value === null ? missing("BILL_OF_LADING", "Nhập ngày hàng đi dự kiến (ETD trên booking) – không dùng ngày hàng đến") : d;
  } },

  { code: "HD_PL", no: N.HD_PL, section: "VALUE", label: "Phân loại hình thức hóa đơn", required: true, options: { sources: [profileSource("HD_PL")], allowFixed: true }, from: (i) => invoiceKind(i, "EDA") },
  { code: "SO_HD", no: N.SO_HD, section: "VALUE", label: "Số hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.no, "INVOICE") },
  { code: "NGAY_HD", no: N.NGAY_HD, section: "VALUE", label: "Ngày phát hành hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.date, "INVOICE") },
  { code: "PT_TT", no: N.PT_TT, section: "VALUE", label: "Phương thức thanh toán", required: true, options: { sources: [profileSource("PT_TT")], allowFixed: true }, from: (i) => paymentMethod(i, "EDA") },
  // Không có hóa đơn → không khai 2.39 ô 4, nên không bắt buộc.
  { code: "GIA_PL", no: N.GIA_PL, section: "VALUE", label: "Mã phân loại giá hóa đơn", required: false, options: { sources: [profileSource("GIA_PL")], allowFixed: true }, from: (i) => priceKind(i, "EDA") },
  { code: "DK_GIA", no: N.DK_GIA, section: "VALUE", label: "Điều kiện giá hóa đơn", required: true, from: (i) => incotermField(i, "EDA") },
  { code: "MA_TT", no: N.MA_TT, section: "VALUE", label: "Mã đồng tiền của hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.currency, "INVOICE") },
  { code: "TONG_TG", no: N.TONG_TG, section: "VALUE", label: "Tổng trị giá hóa đơn", required: true, from: (i) => {
    const t = fromSourced(i.shipment.invoice.totalAmount, "INVOICE");
    return t.value === null ? { value: i.valuation.invoiceTotal, source: "SYSTEM", note: "Tính từ tổng các dòng hàng" } : t;
  } },
  { code: "TY_GIA", no: null, section: "VALUE", label: "Tỷ giá tính thuế", required: false, from: (i) => {
    const cur = i.shipment.invoice.currency.value ?? i.dossier.currency;
    const rate = i.exchange.rates[cur];
    return rate ? { value: plainNumber(rate), source: "SYSTEM" } : missing("SYSTEM", `Chưa có tỷ giá tính thuế cho ${cur}`);
  } },
  { code: "GHI_CHU", no: N.GHI_CHU, section: "GENERAL", label: "Phần ghi chú", required: false, from: (i) => ({ value: i.dossier.note ?? null, source: "DOSSIER" }) },
  { code: "SO_QLNB", no: N.SO_QLNB, section: "GENERAL", label: "Số quản lý nội bộ doanh nghiệp", required: false, from: (i) => ({ value: i.dossier.code, source: "DOSSIER" }) },
];
