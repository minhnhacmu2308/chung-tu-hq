// Mẫu 02 – tờ khai xuất khẩu (EDA). Người xuất khẩu = doanh nghiệp (tài khoản); người nhập khẩu = buyer trên invoice.
import { resolvePackageUnit, resolvePayment, resolvePort, transportModeCode } from "../catalog-resolve.js";
import { EDA_NO as N } from "./numbers.js";
import { fixed, fromSourced, missing, plainNumber, vnDate, type FieldMapping, type MappedValue } from "./types.js";

const port = (raw: string | null, pick: ReturnType<typeof resolvePort>, source: MappedValue["source"]): MappedValue =>
  pick ? { value: `${pick.code} – ${pick.name}`, source } : raw ? { value: raw, source, suspect: true, note: `Không tìm thấy mã VNACCS cho “${raw}” – chọn mã địa điểm` } : missing(source, "Chưa có địa điểm trên chứng từ");

export const EDA_MAPPINGS: FieldMapping[] = [
  { code: "SOTK", no: N.SOTK, section: "GENERAL", label: "Số tờ khai", required: false, from: (i) => ({ value: i.dossier.declarationNo ?? "Chưa cấp – nhận sau khi truyền EDA", source: "SYSTEM" }) },
  { code: "MA_LH", no: N.MA_LH, section: "GENERAL", label: "Mã loại hình", required: true, from: (i) => ({ value: i.dossier.typeCode, source: "DOSSIER" }) },
  { code: "PTVC", no: N.PTVC, section: "GENERAL", label: "Mã phương thức vận chuyển", required: true, from: (i) => {
    const m = transportModeCode(i.dossier.transportMode, i.shipment.transport.containers.length > 0);
    return { value: `${m.code} – ${m.name}`, source: "DOSSIER" };
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

  { code: "SO_VD", no: N.SO_VD, section: "TRANSPORT", label: "Số vận đơn / booking", required: false, from: (i) => {
    const s = i.shipment.transport.billNo.value ? i.shipment.transport.billNo : i.shipment.transport.masterBillNo;
    return s.value ? fromSourced(s, "BILL_OF_LADING") : { value: null, source: "BILL_OF_LADING", note: "Có thể bổ sung sau khi có booking / vận đơn" };
  } },
  { code: "SO_KIEN", no: N.SO_KIEN, section: "TRANSPORT", label: "Số lượng kiện", required: true, from: (i) => {
    const p = fromSourced(i.shipment.transport.packages, "PACKING_LIST");
    const u = resolvePackageUnit(i.shipment.transport.packageUnit.value);
    return p.value === null ? missing("PACKING_LIST", "Chưa có số kiện trên Packing List") : { ...p, value: `${p.value} ${u?.code ?? "PK"}` };
  } },
  { code: "TRONG_LUONG", no: N.TRONG_LUONG, section: "TRANSPORT", label: "Tổng trọng lượng hàng (Gross)", required: true, from: (i) => {
    const g = fromSourced(i.shipment.transport.grossWeightKg, "PACKING_LIST");
    return g.value === null ? missing("PACKING_LIST", "Chưa có tổng trọng lượng") : { ...g, value: plainNumber(g.value) };
  } },
  { code: "KHO", no: N.KHO, section: "TRANSPORT", label: "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", required: true, from: () => missing("DOSSIER", "Chọn mã địa điểm lưu kho / tập kết hàng xuất") },
  { code: "CANG_DO", no: N.CANG_DO, section: "TRANSPORT", label: "Địa điểm nhận hàng cuối cùng", required: true, from: (i) => {
    const pod = i.shipment.transport.portOfDischarge;
    return port(pod.value, resolvePort(pod.value), fromSourced(pod, "BILL_OF_LADING").source);
  } },
  { code: "CANG_XEP", no: N.CANG_XEP, section: "TRANSPORT", label: "Địa điểm xếp hàng", required: true, from: (i) => {
    const pol = i.shipment.transport.portOfLoading;
    // Chỉ mặc định Hải Phòng khi chứng từ KHÔNG ghi cảng xếp; có ghi mà không tra được mã → giữ chữ gốc, nghi ngờ (port()).
    const r = pol.value ? resolvePort(pol.value) : resolvePort("HAIPHONG");
    return { ...port(pol.value, r, fromSourced(pol, "BILL_OF_LADING").source), ...(pol.value ? {} : { source: "DEFAULT" as const, note: "Mặc định cảng Hải Phòng – sửa nếu xuất qua cảng khác" }) };
  } },
  { code: "PTVC_TEN", no: N.PTVC_TEN, section: "TRANSPORT", label: "Tên phương tiện vận chuyển", required: false, from: (i) => {
    const v = fromSourced(i.shipment.transport.vessel, "BILL_OF_LADING");
    return v.value === null ? { value: null, source: "BILL_OF_LADING", note: "Bổ sung khi có booking" } : v;
  } },
  { code: "NGAY_DI", no: N.NGAY_DI, section: "TRANSPORT", label: "Ngày hàng đi dự kiến", required: false, from: (i) => fromSourced(i.shipment.transport.arrivalDate, "BILL_OF_LADING") },

  { code: "SO_HD", no: N.SO_HD, section: "VALUE", label: "Số hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.no, "INVOICE") },
  { code: "NGAY_HD", no: N.NGAY_HD, section: "VALUE", label: "Ngày phát hành hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.date, "INVOICE") },
  { code: "PT_TT", no: N.PT_TT, section: "VALUE", label: "Phương thức thanh toán", required: true, from: (i) => {
    const raw = i.shipment.invoice.paymentTerms;
    const r = resolvePayment(raw.value);
    return r ? { ...fromSourced(raw, "CONTRACT"), value: `${r.code} – ${r.name}` } : missing("CONTRACT", "Chưa có phương thức thanh toán");
  } },
  { code: "GIA_PL", no: N.GIA_PL, section: "VALUE", label: "Mã phân loại giá hóa đơn", required: true, from: () => fixed("A – Giá hóa đơn cho hàng hóa phải trả tiền") },
  { code: "DK_GIA", no: N.DK_GIA, section: "VALUE", label: "Điều kiện giá hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.incoterm, "INVOICE", (v) => v.toUpperCase()) },
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
