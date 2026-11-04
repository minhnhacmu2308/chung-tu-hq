// Mẫu 02 – tờ khai xuất khẩu (EDA). Người xuất khẩu = doanh nghiệp (tài khoản); người nhập khẩu = buyer trên invoice.
import { resolvePort, resolveWorldPort, transportModeCode } from "../catalog-resolve.js";
import { EDA_NO as N } from "./numbers.js";
import { dec } from "../../../../shared/decimal.js";
import { isDomesticDelivery } from "@kb/contracts";
import { EXPORT_NO_240, exportAdjustmentsAllowed, freightRequired, incotermCode, planExportAdjustments } from "../adjustments.js";
import { domesticPorts, foreignPorts, incotermField, invoiceKind, onSitePlace, packageCount, paymentMethod, permitsField, port, priceKind } from "./shared.js";
import { BY_WATER, EXPORT_VALUE, IN_CONTAINER, RE_EXPORT, TEMP_EXPORT } from "./conditions.js";
import { profileSource, SRC } from "./sources.js";
import { fixed, fromSourced, missing, plainNumber, profileOr, vnDate, type FieldMapping, type MappedValue, type MappingInput } from "./types.js";

const isVn = (code: string | undefined) => !!code?.startsWith("VN");

/**
 * 2.40 Trị giá tính thuế (tổng): khai khi điều kiện giá khác FOB hoặc không có hóa đơn. Trị giá hải quan hàng xuất = giá đến
 * cửa khẩu xuất, không gồm cước và bảo hiểm quốc tế (planExportAdjustments đã trừ). Cùng tiền tệ hóa đơn thì khai theo tiền tệ đó, khác thì VND.
 */
const exportCustomsValue = (i: MappingInput): MappedValue => {
  const incoterm = incotermCode(i.shipment.invoice.incoterm.value);
  const noInvoice = i.shipment.documents.every((d) => d.kind !== "INVOICE");
  if (EXPORT_NO_240.has(incoterm) && !noInvoice) {
    return { value: null, source: "SYSTEM", note: `${incoterm}: không khai chỉ tiêu 2.40 – Hải quan lấy trị giá hóa đơn làm trị giá tính thuế` };
  }
  const notes = planExportAdjustments(i.shipment, i.charges, i.dossier.transportMode).notes;
  const value = exportValueText(i);
  const deducted = i.adjustments.filter((a) => a.kind === "SUBTRACT").map((a) => a.label.toLowerCase());
  const added = i.adjustments.filter((a) => a.kind === "ADD").map((a) => a.label.toLowerCase());
  const note = [
    deducted.length ? `Đã trừ ${deducted.join(", ")} khỏi giá hóa đơn ${incoterm}` : null,
    added.length ? `Đã cộng ${added.join(", ")}` : null,
    isDomesticDelivery(i.dossier.transportMode) ? `Phương thức vận chuyển 9 (giao hàng tại chỗ, trong nước): không trừ cước, bảo hiểm quốc tế khỏi giá ${incoterm}` : null,
    ...notes,
  ].filter(Boolean).join(". ");
  // Chặn duyệt = để trống (canApprove chỉ chặn chỉ tiêu blocking chưa có giá trị) – không khai trị giá chưa trừ cước.
  if (exportFreightMissing(i)) return { value: null, source: "SYSTEM", suspect: true, blocking: true, note: `${note}. Nhập số cước hoặc lý do chưa có ở bước OCR & kiểm tra` };
  return { value, source: "SYSTEM", ...(notes.length ? { suspect: true } : {}), ...(note ? { note } : {}) };
};

/** Giá đã gồm cước mà không có số cước, cũng không có lý do người khai ghi nhận → trị giá tính thuế sai, chặn duyệt. */
const exportFreightMissing = (i: MappingInput) =>
  freightRequired("EDA", incotermCode(i.shipment.invoice.incoterm.value), i.dossier.transportMode) && !i.adjustments.some((a) => a.label.startsWith("Cước")) && !i.charges.freight;

/** Trị giá 2.40 dạng "19660 USD": cùng tiền tệ hóa đơn thì tính theo tiền tệ đó, khác thì lấy trị giá quy VND. */
function exportValueText(i: MappingInput): string {
  const cur = i.shipment.invoice.currency.value ?? i.dossier.currency;
  if (!i.adjustments.every((a) => a.currency === cur)) return `${i.valuation.customsValueVnd} VND`;
  return `${plainNumber(i.adjustments.reduce((s, a) => (a.kind === "SUBTRACT" ? s.minus(a.amount) : s.plus(a.amount)), dec(i.valuation.invoiceTotal)).toFixed())} ${cur}`;
}

/** Tên ngắn không dấu của khoản trong diễn giải 2.32 (ô VNACCS chỉ nhận chữ không dấu). */
const shortLabel = (label: string) => (label.startsWith("Cước") ? "cuoc" : label.startsWith("Phí bảo hiểm") ? "BH" : "dc khac");
const MRK_MAX = 140;

/**
 * 2.32 Ký hiệu và số hiệu: tờ khai xuất không có ô cước / bảo hiểm / khoản điều chỉnh, người khai tự tính rồi khai kết quả ở 2.40.
 * Phụ lục II chỉ tiêu 2.57 cho ghi tiếp sang 2.32 khi Phần ghi chú không đủ chỗ → phần mềm tự diễn giải cách tính 2.40 vào đây
 * (vd "TGTT 2.40: CIF 20850 USD - cuoc 1150 USD - BH 40 USD = 19660 USD"). Không có khoản trừ / cộng hoặc chưa tính được 2.40 → để trống.
 */
const valuationMarks = (i: MappingInput): MappedValue => {
  const incoterm = incotermCode(i.shipment.invoice.incoterm.value);
  const hint = "Phần mềm tự diễn giải cách tính trị giá tính thuế 2.40; ghi thêm ký hiệu bao bì (shipping marks) nếu có, tối đa 140 ký tự";
  if (!i.adjustments.length || !exportAdjustmentsAllowed(incoterm) || exportFreightMissing(i)) return { value: null, source: "DOSSIER" };
  const cur = i.shipment.invoice.currency.value ?? i.dossier.currency;
  const parts = i.adjustments.map((a) => `${a.kind === "SUBTRACT" ? "-" : "+"} ${shortLabel(a.label)} ${plainNumber(a.amount)} ${a.currency}`);
  const head = `TGTT 2.40: ${incoterm} ${plainNumber(i.valuation.invoiceTotal)} ${cur}`;
  const full = `${head} ${parts.join(" ")} = ${exportValueText(i)}`;
  // Quá 140 ký tự (nhiều khoản) → gộp phần điều chỉnh, chi tiết xem ở bước OCR & kiểm tra.
  const value = full.length <= MRK_MAX ? full : `${head} +/- dieu chinh = ${exportValueText(i)}`;
  return { value, source: "SYSTEM", note: hint };
};

export const EDA_MAPPINGS: FieldMapping[] = [
  { code: "SOTK", no: N.SOTK, section: "GENERAL", label: "Số tờ khai", required: false, from: (i) => ({ value: i.dossier.declarationNo ?? "Chưa cấp – nhận sau khi truyền EDA", source: "SYSTEM" }) },
  { code: "MA_LH", no: N.MA_LH, section: "GENERAL", label: "Mã loại hình", required: true, from: (i) => ({ value: i.dossier.typeCode, source: "DOSSIER" }) },
  { code: "PTVC", no: N.PTVC, section: "GENERAL", label: "Mã phương thức vận chuyển", required: true, from: (i) => {
    const m = transportModeCode(i.dossier.transportMode, i.shipment.transport.containers.length > 0);
    return { value: `${m.code} – ${m.name}`, source: "DOSSIER", ...(m.note ? { suspect: true, note: m.note } : {}) };
  } },
  { code: "CQHQ", no: N.CQHQ, section: "GENERAL", label: "Mã cơ quan Hải quan", required: true, from: (i) => ({ value: i.dossier.customsOfficeName ? `${i.dossier.customsOfficeCode} – ${i.dossier.customsOfficeName}` : i.dossier.customsOfficeCode, source: "DOSSIER" }) },
  { code: "NGAY_DK", no: N.NGAY_DK, section: "GENERAL", label: "Ngày khai báo dự kiến", required: false, from: (i) => ({ value: vnDate(i.now), source: "SYSTEM" }) },
  { code: "TNTX_TK", no: N.TNTX_TK, section: "GENERAL", label: "Số tờ khai tạm nhập tương ứng", required: true, when: RE_EXPORT, from: () => ({ value: null, source: "DOSSIER", note: "Nhập số tờ khai tạm nhập (12 số) của lô hàng tái xuất" }) },
  { code: "HAN_TN", no: N.HAN_TN, section: "GENERAL", label: "Thời hạn tái nhập khẩu", required: true, when: TEMP_EXPORT, from: () => ({ value: null, source: "DOSSIER", note: "Nhập ngày hết hạn hàng tạm xuất phải tái nhập theo quy định" }) },

  { code: "NXK_MST", no: N.NXK_MST, section: "PARTIES", label: "Mã số thuế người xuất khẩu", required: true, from: (i) => ({ value: i.org.taxCode, source: "ACCOUNT" }) },
  { code: "NXK_TEN", no: N.NXK_TEN, section: "PARTIES", label: "Tên người xuất khẩu", required: true, from: (i) => ({ value: i.org.name, source: "ACCOUNT" }) },
  // 2.13 mã bưu chính người xuất khẩu (tùy chọn – đặc tả FPT không bắt buộc TK_EPP): lấy từ Tài khoản; mã chỉ tiêu = tên ô VNACCS như IDA 1.14.
  { code: "TK_EPP", no: "2.13", section: "PARTIES", label: "Mã bưu chính", required: false, from: (i) => ({ value: i.org.postalCode || null, source: "ACCOUNT" }) },
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
    const onSite = onSitePlace(i);
    if (onSite) return onSite;
    const fd = i.shipment.transport.finalDestination;
    const pod = i.shipment.transport.portOfDischarge;
    const buyerCountry = i.shipment.parties.buyer.country.value;
    const fdPort = resolveWorldPort(fd.value, buyerCountry, foreignPorts(i));
    if (fdPort) return port(fd.value, fdPort, fromSourced(fd, "BILL_OF_LADING").source);
    return port(pod.value, resolveWorldPort(pod.value, buyerCountry, foreignPorts(i)), fromSourced(pod, "BILL_OF_LADING").source);
  } },
  // 2.29: bắt buộc (trừ PTVC mã 9), là cảng/ICD/cửa khẩu/sân bay tại Việt Nam – không tự điền mặc định.
  { code: "CANG_XEP", no: N.CANG_XEP, section: "TRANSPORT", label: "Địa điểm xếp hàng", required: true, from: (i) => {
    const onSite = onSitePlace(i);
    if (onSite) return onSite;
    const pol = i.shipment.transport.portOfLoading;
    // Địa điểm Việt Nam đúng PTVC của lô trước; không có thì tra cả danh mục để báo "phải là địa điểm tại Việt Nam".
    const r = resolvePort(pol.value, domesticPorts(i)) ?? resolvePort(pol.value, i.catalogs?.worldPorts);
    const v = pol.value ? port(pol.value, r, fromSourced(pol, "BILL_OF_LADING").source) : missing("BILL_OF_LADING", "Chọn địa điểm xếp hàng tại Việt Nam (cảng, ICD, cửa khẩu, sân bay) – bắt buộc (chỉ tiêu 2.29)");
    return r && !isVn(r.code) ? { ...v, suspect: true, note: "Địa điểm xếp hàng của tờ khai xuất phải là địa điểm tại Việt Nam" } : v;
  } },
  { code: "HO_HIEU", no: N.HO_HIEU, section: "TRANSPORT", label: "Hô hiệu phương tiện (call sign)", required: false, from: (i) => (BY_WATER.test(i)
    ? { ...fixed("9999"), note: "Ô 1 chỉ tiêu 2.30: hô hiệu tàu – điền sẵn 9999 (tàu chưa đăng ký trên hệ thống); B/L có hô hiệu thật thì sửa lại" }
    // PTVC khác 2, 3, 6: ô vẫn có, để trống cho người khai tự nhập (đổi PTVC trên tờ khai → ô đổi theo, transportPlaceChanges).
    : { value: null, source: "DOSSIER", note: "Ô 1 chỉ tiêu 2.30: phương thức khác đường biển/sông – người khai tự nhập mã phương tiện nếu có" }) },
  // 2.60: tối đa 50 số container (phần dư khai qua HYS).
  { code: "SO_CONT", no: N.SO_CONT, section: "TRANSPORT", label: "Số container", required: false, when: IN_CONTAINER, from: (i) => {
    const c = i.shipment.transport.containers.map((x) => x.no);
    return c.length ? { value: c.join(", "), source: "BILL_OF_LADING" } : missing("BILL_OF_LADING", "Chưa có số container – nhập khi hàng đóng container");
  } },
  // Mã chỉ tiêu = tên ô VNACCS (như 2.13 TK_EPP) – gửi FPT qua applyExtras; người khai sửa thì giá trị sửa thắng.
  { code: "TK_MRK", no: "2.32", section: "TRANSPORT", label: "Ký hiệu và số hiệu", required: false, from: valuationMarks },
  // 2.59 địa chỉ địa điểm xếp hàng lên xe chở hàng: mặc định địa chỉ người xuất khẩu (Tài khoản) – người khai sửa khi đóng hàng nơi khác.
  // Mã 1–5 người khai nhập theo thứ tự (danh mục A202), tên tự điền theo mã 1 trên panel sửa ô.
  { code: "CON_VA", no: "2.59", section: "TRANSPORT", label: "Địa chỉ địa điểm xếp hàng lên xe chở hàng", required: false, when: IN_CONTAINER, from: (i) => ({ value: i.org.address || null, source: "ACCOUNT" }) },
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
  { code: "GP", no: N.GP, section: "VALUE", label: "Giấy phép xuất khẩu", required: false, from: (i) => permitsField(i, "EDA") },
  { code: "TG_TT", no: N.TG_TT, section: "VALUE", label: "Trị giá tính thuế", required: false, when: EXPORT_VALUE, from: exportCustomsValue },
  { code: "NGUOI_NT", no: N.NGUOI_NT, section: "GENERAL", label: "Người nộp thuế", required: false, options: { sources: [profileSource("NGUOI_NT")], allowFixed: true }, from: (i) => profileOr(i, "NGUOI_NT", fixed("1 – Người xuất khẩu")) },
  // 2.80 khai theo từng dòng hàng (HAG_OL1..5). Chứng từ không cho biết mặt hàng thuộc quản lý chuyên ngành → người khai nhập.
  { code: "VBPQ", no: N.VBPQ, section: "VALUE", label: "Mã văn bản pháp luật khác (theo dòng hàng)", required: false, from: () => ({ value: null, source: "DOSSIER", note: "Khai khi hàng xuất khẩu thuộc quản lý chuyên ngành. Mã áp cho mọi dòng ghi cách nhau dấu cách; riêng từng dòng ghi “số dòng: mã”, các phần cách nhau dấu “;” (ví dụ “XK; 2: GP KD”). Tối đa 5 mã mỗi dòng" }) },
  // Ghi chú của hồ sơ là ghi chú nội bộ (“không gửi Hải quan”) – người khai tự nhập nội dung gửi Hải quan ở chỉ tiêu này.
  { code: "GHI_CHU", no: N.GHI_CHU, section: "GENERAL", label: "Phần ghi chú", required: false, from: () => ({ value: null, source: "DOSSIER" }) },
  { code: "SO_QLNB", no: N.SO_QLNB, section: "GENERAL", label: "Số quản lý nội bộ doanh nghiệp", required: false, from: (i) => ({ value: i.dossier.code, source: "DOSSIER" }) },
];
