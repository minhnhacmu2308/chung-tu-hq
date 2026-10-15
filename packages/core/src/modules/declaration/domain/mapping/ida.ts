// Mẫu 01 – tờ khai nhập khẩu (IDA). Người nhập khẩu lấy theo tài khoản (MST), KHÔNG lấy tên tiếng Anh trên invoice (PRODUCT §7.4).
import { PARTY_CLASS_LABELS } from "@kb/contracts";
import { resolveDischargePort, resolvePort, transportModeCode } from "../catalog-resolve.js";
import { FREIGHT_NOT_INCLUDED, incotermCode } from "../adjustments.js";
import { IDA_NO as N } from "./numbers.js";
import { incotermField, invoiceKind, lineHs, packageCount, paymentMethod, port, priceKind } from "./shared.js";
import { profileSource, SRC, warehouseFromAn } from "./sources.js";
import { fixed, fromSourced, missing, plainNumber, profileOr, vnDate, type FieldMapping, type MappedValue, type MappingInput } from "./types.js";

/** 1.68 Phần ghi chú: TT121 yêu cầu ghi số và ngày cấp C/O tại đây; các nội dung ngăn cách bằng dấu “;”. */
const coRef = (i: MappingInput) => {
  const o = i.shipment.origin;
  if (o.rexNo.value) return `REX ${o.rexNo.value}`;
  if (o.coNo.value) return `C/O${o.coForm.value ? ` form ${o.coForm.value}` : ""} số ${o.coNo.value}`;
  return null;
};

const charge = (i: MappingInput, label: string): MappedValue => {
  const a = i.adjustments.find((x) => x.label.startsWith(label));
  if (a) return { value: `${a.amount} ${a.currency}`, source: a.source, ...(a.rate ? {} : { suspect: true, note: `Chưa có tỷ giá cho ${a.currency}` }) };
  const incoterm = incotermCode(i.shipment.invoice.incoterm.value);
  if (label.startsWith("Cước") && FREIGHT_NOT_INCLUDED.has(incoterm)) return missing("SYSTEM", `${incoterm}: cần cước vận chuyển quốc tế – chưa có hóa đơn cước / Arrival Notice`);
  return { value: null, source: "SYSTEM", note: "Đã gồm trong giá hóa đơn" };
};

export const IDA_MAPPINGS: FieldMapping[] = [
  { code: "SOTK", no: N.SOTK, section: "GENERAL", label: "Số tờ khai", required: false, from: (i) => ({ value: i.dossier.declarationNo ?? "Chưa cấp – nhận sau khi truyền IDA", source: "SYSTEM" }) },
  { code: "MA_LH", no: N.MA_LH, section: "GENERAL", label: "Mã loại hình", required: true, from: (i) => ({ value: i.dossier.typeCode, source: "DOSSIER" }) },
  { code: "PTVC", no: N.PTVC, section: "GENERAL", label: "Mã phương thức vận chuyển", required: true, from: (i) => {
    const m = transportModeCode(i.dossier.transportMode, i.shipment.transport.containers.length > 0);
    return { value: `${m.code} – ${m.name}`, source: "DOSSIER", ...(m.note ? { suspect: true, note: m.note } : {}) };
  } },
  // Chọn theo từng hồ sơ khi tạo (mặc định 4); doanh nghiệp vẫn có thể ghi đè bằng Mặc định khai báo / giá trị cố định.
  { code: "PL_CN", no: N.PL_CN, section: "GENERAL", label: "Mã phân loại cá nhân/tổ chức", required: true, options: { sources: [profileSource("PL_CN")], allowFixed: true }, from: (i) => ({ value: `${i.dossier.partyClass} – ${PARTY_CLASS_LABELS[i.dossier.partyClass]}`, source: "DOSSIER" }) },
  { code: "CQHQ", no: N.CQHQ, section: "GENERAL", label: "Mã cơ quan Hải quan", required: true, from: (i) => ({ value: i.dossier.customsOfficeName ? `${i.dossier.customsOfficeCode} – ${i.dossier.customsOfficeName}` : i.dossier.customsOfficeCode, source: "DOSSIER" }) },
  { code: "NGAY_DK", no: N.NGAY_DK, section: "GENERAL", label: "Ngày khai báo dự kiến", required: false, from: (i) => ({ value: vnDate(i.now), source: "SYSTEM" }) },

  { code: "NNK_MST", no: N.NNK_MST, section: "PARTIES", label: "Mã số thuế người nhập khẩu", required: true, from: (i) => ({ value: i.org.taxCode, source: "ACCOUNT" }) },
  { code: "NNK_TEN", no: N.NNK_TEN, section: "PARTIES", label: "Tên người nhập khẩu", required: true, from: (i) => ({ value: i.org.name, source: "ACCOUNT" }) },
  { code: "NNK_DC", no: N.NNK_DC, section: "PARTIES", label: "Địa chỉ người nhập khẩu", required: true, from: (i) => ({ value: i.org.address || null, source: "ACCOUNT", ...(i.org.address ? {} : { suspect: true, note: "Cập nhật địa chỉ doanh nghiệp ở Tài khoản" }) }) },
  { code: "NNK_DT", no: N.NNK_DT, section: "PARTIES", label: "Số điện thoại người nhập khẩu", required: false, from: (i) => ({ value: i.org.phone || null, source: "ACCOUNT" }) },
  { code: "NXK_TEN", no: N.NXK_TEN, section: "PARTIES", label: "Tên người xuất khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.seller.name, "INVOICE") },
  { code: "NXK_DC", no: N.NXK_DC, section: "PARTIES", label: "Địa chỉ người xuất khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.seller.address, "INVOICE") },
  { code: "MA_NUOC", no: N.MA_NUOC, section: "PARTIES", label: "Mã nước người xuất khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.seller.country, "INVOICE") },

  { code: "SO_VD", no: N.SO_VD, section: "TRANSPORT", label: "Số vận đơn", required: true, options: { sources: [SRC.houseBill, SRC.masterBill], allowFixed: false }, from: (i) => {
    const s = i.shipment.transport.billNo.value ? i.shipment.transport.billNo : i.shipment.transport.masterBillNo;
    return s.value ? fromSourced(s, "BILL_OF_LADING") : missing("BILL_OF_LADING", "Chưa có vận đơn (B/L hoặc AWB)");
  } },
  { code: "SO_KIEN", no: N.SO_KIEN, section: "TRANSPORT", label: "Số lượng kiện", required: true, from: (i) => packageCount(i, "Chưa có số kiện trên Packing List / vận đơn") },
  { code: "TRONG_LUONG", no: N.TRONG_LUONG, section: "TRANSPORT", label: "Tổng trọng lượng hàng (Gross)", required: true, from: (i) => {
    const g = fromSourced(i.shipment.transport.grossWeightKg, "PACKING_LIST");
    return g.value === null ? missing("PACKING_LIST", "Chưa có tổng trọng lượng") : { ...g, value: plainNumber(g.value) };
  } },
  { code: "KHO", no: N.KHO, section: "TRANSPORT", label: "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", required: true, options: { sources: [SRC.anWarehouse, profileSource("KHO")], allowFixed: true }, from: (i) =>
    warehouseFromAn(i) ?? profileOr(i, "KHO", missing("DOSSIER", "Chọn mã địa điểm lưu kho (kho/bãi/cảng nơi hàng chờ thông quan – CV 4613/TCHQ-VNACCS)")) },
  { code: "CANG_DO", no: N.CANG_DO, section: "TRANSPORT", label: "Mã địa điểm dỡ hàng", required: true, from: (i) => {
    const pod = i.shipment.transport.portOfDischarge;
    const r = resolveDischargePort(pod.value, i.shipment.transport.finalDestination.value);
    const base = port(pod.value, r.resolved, fromSourced(pod, "BILL_OF_LADING").source);
    return r.note ? { ...base, suspect: true, note: r.note } : base;
  } },
  { code: "CANG_XEP", no: N.CANG_XEP, section: "TRANSPORT", label: "Mã địa điểm xếp hàng", required: true, from: (i) => {
    const pol = i.shipment.transport.portOfLoading;
    return port(pol.value, resolvePort(pol.value), fromSourced(pol, "BILL_OF_LADING").source);
  } },
  { code: "PTVC_TEN", no: N.PTVC_TEN, section: "TRANSPORT", label: "Tên phương tiện vận chuyển", required: true, from: (i) => {
    const v = fromSourced(i.shipment.transport.vessel, "BILL_OF_LADING");
    const voy = i.shipment.transport.voyage.value;
    return v.value === null ? missing("BILL_OF_LADING", "Chưa có tên tàu / chuyến bay") : { ...v, value: voy ? `${v.value} V.${voy}` : v.value };
  } },
  { code: "NGAY_DEN", no: N.NGAY_DEN, section: "TRANSPORT", label: "Ngày hàng đến", required: true, options: { sources: [SRC.arrivalDate, SRC.departureDate], allowFixed: false }, from: (i) => {
    const d = fromSourced(i.shipment.transport.arrivalDate, "BILL_OF_LADING");
    if (d.value !== null) return d;
    // Hàng air thường không có Arrival Notice riêng: dự phòng bằng ngày bay (ngày đi) – người khai kiểm lại.
    const dep = i.shipment.transport.departureDate;
    if (i.dossier.transportMode === "AIR" && dep.value) return { ...fromSourced(dep, "BILL_OF_LADING"), suspect: true, note: "Hàng air chưa có ETA: tạm lấy ngày bay trên AWB – kiểm ngày hàng đến thực tế" };
    return missing("ARRIVAL_NOTICE", "Chưa có ngày hàng đến (ETA trên Arrival Notice)");
  } },

  { code: "HD_PL", no: N.HD_PL, section: "VALUE", label: "Phân loại hình thức hóa đơn", required: true, options: { sources: [profileSource("HD_PL")], allowFixed: true }, from: (i) => invoiceKind(i, "IDA") },
  { code: "SO_HD", no: N.SO_HD, section: "VALUE", label: "Số hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.no, "INVOICE") },
  { code: "NGAY_HD", no: N.NGAY_HD, section: "VALUE", label: "Ngày phát hành hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.date, "INVOICE") },
  { code: "PT_TT", no: N.PT_TT, section: "VALUE", label: "Phương thức thanh toán", required: true, options: { sources: [profileSource("PT_TT")], allowFixed: true }, from: (i) => paymentMethod(i, "IDA") },
  { code: "GIA_PL", no: N.GIA_PL, section: "VALUE", label: "Mã phân loại giá hóa đơn", required: true, options: { sources: [profileSource("GIA_PL")], allowFixed: true }, from: (i) => priceKind(i, "IDA") },
  { code: "DK_GIA", no: N.DK_GIA, section: "VALUE", label: "Điều kiện giá hóa đơn", required: true, from: (i) => incotermField(i, "IDA") },
  { code: "MA_TT", no: N.MA_TT, section: "VALUE", label: "Mã đồng tiền của hóa đơn", required: true, from: (i) => fromSourced(i.shipment.invoice.currency, "INVOICE") },
  { code: "TONG_TG", no: N.TONG_TG, section: "VALUE", label: "Tổng trị giá hóa đơn", required: true, from: (i) => {
    const t = fromSourced(i.shipment.invoice.totalAmount, "INVOICE");
    return t.value === null ? { value: i.valuation.invoiceTotal, source: "SYSTEM", note: "Tính từ tổng các dòng hàng" } : t;
  } },
  { code: "KHAI_TG", no: N.KHAI_TG, section: "VALUE", label: "Mã phân loại khai trị giá", required: true, options: { sources: [profileSource("KHAI_TG")], allowFixed: true }, from: (i) => profileOr(i, "KHAI_TG", fixed("6 – Áp dụng phương pháp trị giá giao dịch")) },
  { code: "PHI_VC", no: N.PHI_VC, section: "VALUE", label: "Phí vận chuyển", required: false, from: (i) => charge(i, "Cước") },
  { code: "PHI_BH", no: N.PHI_BH, section: "VALUE", label: "Phí bảo hiểm", required: false, from: (i) => charge(i, "Phí bảo hiểm") },
  { code: "KHOAN_DC", no: N.KHOAN_DC, section: "VALUE", label: "Khoản điều chỉnh khác", required: false, from: (i) => {
    const others = i.adjustments.filter((a) => !a.label.startsWith("Cước") && !a.label.startsWith("Phí bảo hiểm"));
    return others.length ? { value: others.map((a) => `${a.label}: ${a.amount} ${a.currency}`).join("; "), source: others[0]!.source } : { value: null, source: "SYSTEM" };
  } },
  { code: "TY_GIA", no: null, section: "VALUE", label: "Tỷ giá tính thuế", required: false, from: (i) => {
    const cur = i.shipment.invoice.currency.value ?? i.dossier.currency;
    const rate = i.exchange.rates[cur];
    return rate ? { value: plainNumber(rate), source: "SYSTEM", note: `Tỷ giá ngày ${i.exchange.date}; Hải quan áp tỷ giá tại ngày đăng ký tờ khai` } : missing("SYSTEM", `Chưa có tỷ giá tính thuế cho ${cur} – nhập ở Quản trị hệ thống`);
  } },
  { code: "SO_CO", no: null, section: "VALUE", label: "Chứng từ chứng nhận xuất xứ", required: false, from: (i) => {
    const o = i.shipment.origin;
    const inNote = "Đã ghi vào Phần ghi chú (1.68) – TT121 yêu cầu ghi cả ngày cấp C/O";
    if (o.rexNo.value) return { ...fromSourced(o.rexNo, "CERT_OF_ORIGIN"), value: `REX ${o.rexNo.value} (tự chứng nhận EVFTA)`, note: inNote };
    if (o.coNo.value) return { ...fromSourced(o.coNo, "CERT_OF_ORIGIN"), value: o.coForm.value ? `${o.coNo.value} (form ${o.coForm.value})` : o.coNo.value, note: inNote };
    return { value: null, source: "CERT_OF_ORIGIN", note: "Không có C/O – áp thuế suất MFN" };
  } },
  // CV 2061/TCHQ-GSQL: tờ khai NK có hàng chương 84/85 → ô 1 chỉ tiêu 1.37 bắt buộc MO/CU, sai thì hệ thống từ chối đăng ký.
  // Không tự điền MO: tình trạng mới/đã qua sử dụng không suy ra được từ chứng từ, người khai phải chọn.
  { code: "VBPQ", no: N.VBPQ, section: "GENERAL", label: "Mã văn bản pháp quy khác", required: false, from: (i) => {
    const n = lineHs(i).filter((h) => /^(84|85)/.test(h)).length;
    if (!n) return { value: null, source: "SYSTEM" };
    return { value: null, source: "DOSSIER", suspect: true, blocking: true, note: `${n} dòng chương 84/85: ô 1 khai MO (máy móc, thiết bị chưa qua sử dụng) hoặc CU (đã qua sử dụng) – thiếu/sai hệ thống từ chối đăng ký tờ khai (CV 2061/TCHQ-GSQL)` };
  } },
  { code: "NGUOI_NT", no: N.NGUOI_NT, section: "GENERAL", label: "Người nộp thuế", required: true, options: { sources: [profileSource("NGUOI_NT")], allowFixed: true }, from: (i) => profileOr(i, "NGUOI_NT", fixed("1 – Người nhập khẩu")) },
  { code: "GHI_CHU", no: N.GHI_CHU, section: "GENERAL", label: "Phần ghi chú", required: false, from: (i) => {
    const c = i.shipment.transport.containers;
    const co = coRef(i);
    const parts = [co, i.dossier.note, c.length ? `Container: ${c.map((x) => x.no).join(", ")}` : null].filter(Boolean);
    const value = parts.length ? parts.join("; ") : null;
    return co ? { value, source: "DOSSIER", suspect: true, note: "Bổ sung ngày cấp C/O sau số C/O (TT121, chỉ tiêu 1.68)" } : { value, source: "DOSSIER" };
  } },
  { code: "SO_QLNB", no: N.SO_QLNB, section: "GENERAL", label: "Số quản lý nội bộ doanh nghiệp", required: false, from: (i) => ({ value: i.dossier.code, source: "DOSSIER" }) },
];
