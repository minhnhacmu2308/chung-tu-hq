// Mẫu 01 – tờ khai nhập khẩu (IDA). Người nhập khẩu lấy theo tài khoản (MST), KHÔNG lấy tên tiếng Anh trên invoice (PRODUCT §7.4).
import { DEFAULT_PARTY_CLASS, formatAdjustmentField, NO_INSURANCE_VALUE, PARTY_CLASS_LABELS, type Sourced } from "@kb/contracts";
import { pickDischargePort, pickLoadingPort, resolvePayment, transportModeCode } from "../catalog-resolve.js";
import { FREIGHT_ADJUSTMENT_LABEL, FREIGHT_NOT_INCLUDED, freightReasonText, INSURANCE_ADJUSTMENT_LABEL, INSURANCE_INCLUDED, incotermCode } from "../adjustments.js";
import type { Adjustment } from "../valuation.js";
import { IDA_NO as N } from "./numbers.js";
import { dec } from "../../../../shared/decimal.js";
import { incotermField, invoiceKind, lineHs, packageCount, paymentMethod, permitsField, port, priceKind } from "./shared.js";
import { BY_WATER, IN_CONTAINER, RE_IMPORT, TEMP_IMPORT } from "./conditions.js";
import { profileSource, SRC, warehouseFromAn } from "./sources.js";
import { fixed, fromSourced, missing, plainNumber, profileOr, vnDate, type FieldMapping, type MappedValue, sourceOfKind, type MappingInput } from "./types.js";

/** Mô tả hàng cho biết hàng đã qua sử dụng → mã CU ở 1.37 (CV 2061/TCHQ-GSQL). */
const USED_GOODS = /\b(used|second[\s-]?hand|refurbished|reconditioned|pre-owned)\b|đã qua sử dụng|hàng cũ/i;

/** 1.68 Phần ghi chú: TT121 yêu cầu ghi số và ngày cấp C/O tại đây; các nội dung ngăn cách bằng dấu “;”. */
/** Số C/O kèm ngày cấp (TT121 chỉ tiêu 1.68), vd “C/O mẫu E số: E247079657380002 (04/12/2024)”. */
const coRef = (i: MappingInput): { text: string; dated: boolean } | null => {
  const o = i.shipment.origin;
  if (o.rexNo.value) return { text: `REX ${o.rexNo.value}`, dated: true };
  if (!o.coNo.value) return null;
  const d = o.coDate?.value;
  return { text: `C/O${o.coForm.value ? ` mẫu ${o.coForm.value}` : ""} số: ${o.coNo.value}${d ? ` (${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)})` : ""}`, dated: !!d };
};

/**
 * 1.50 Chi tiết khai trị giá (≤ 280 ký tự): mở đầu bằng ngày vận đơn dạng DDMMYYYY#& (TT121), sau đó các ghi chú trị giá suy được từ chứng từ
 * (dòng hàng FOC). Thiếu ngày vận đơn → để người khai bổ sung, không tự điền.
 */
const valuationDetail = (i: MappingInput): MappedValue => {
  const d = i.shipment.transport.departureDate.value;
  const foc = i.shipment.items.filter((it) => it.amount.value !== null && dec(it.amount.value).isZero()).map((it) => it.lineNo);
  const notes = foc.length ? [`Dòng hàng ${foc.join(", ")} là hàng không thanh toán (FOC/khuyến mại)`] : [];
  // Khai KC (Khác) ở 1.43 thì ghi phương thức thanh toán thực tế tại đây (Phụ lục II, ghi chú chỉ tiêu 1.50).
  const pay = paymentDetail(i.shipment.invoice.paymentTerms.value);
  if (pay) notes.push(pay);
  if (!d) return { value: notes.length ? notes.join("; ") : null, source: "BILL_OF_LADING", suspect: true, note: "Thiếu ngày vận đơn – chỉ tiêu 1.50 mở đầu bằng ngày vận đơn dạng DDMMYYYY#& (TT121)" };
  const date = `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(0, 4)}#&`;
  const src = fromSourced(i.shipment.transport.departureDate, "BILL_OF_LADING");
  return { ...src, value: `${date}${notes.join("; ")}` };
};

/** Phương thức thanh toán thực tế khi 1.43 khai KC: T/T, chuyển khoản → "PHƯƠNG THỨC THANH TOÁN TT"; mã khác không cần ghi thêm. */
function paymentDetail(raw: string | null): string | null {
  const r = resolvePayment(raw);
  if (!r || r.code !== "KC" || !raw) return null;
  return /\bT\s*\/?\s*T\b|TELEGRAPHIC|WIRE|BANK TRANSFER|REMITTANCE|CHUYỂN KHOẢN|CHUYEN KHOAN/i.test(raw) ? "PHƯƠNG THỨC THANH TOÁN TT" : `PHƯƠNG THỨC THANH TOÁN ${raw.trim().toUpperCase()}`;
}

/** Cước / bảo hiểm đã vào trị giá: nhập tay thì ghi lý do; lệch số trên chứng từ hoặc thiếu tỷ giá → nghi ngờ. */
const chargeValue = (a: Adjustment, doc: { amount: Sourced<string>; currency: Sourced<string> | undefined }, invoiceCurrency: string, reason?: string): MappedValue => {
  const notes: string[] = [];
  if (!a.rate) notes.push(`Chưa có tỷ giá cho ${a.currency}`);
  let differs = false;
  if (a.source === "USER") {
    notes.push(reason ? `Người khai nhập – ${reason}` : "Người khai nhập");
    const docCur = doc.currency?.value ?? invoiceCurrency;
    if (doc.amount.value !== null && (!dec(doc.amount.value).eq(a.amount) || docCur !== a.currency)) {
      differs = true;
      notes.push(`Khác số trên chứng từ: ${plainNumber(doc.amount.value)} ${docCur}`);
    }
  }
  return { value: `${a.amount} ${a.currency}`, source: a.source, ...(!a.rate || differs ? { suspect: true } : {}), ...(notes.length ? { note: notes.join(". ") } : {}) };
};

/** 1.47: EXW/FCA/FAS/FOB phải có cước. Không có số và không có lý do → chặn duyệt; có lý do → cho duyệt kèm cảnh báo. */
const freight = (i: MappingInput): MappedValue => {
  const c = i.shipment.charges;
  const invoiceCurrency = i.shipment.invoice.currency.value ?? i.dossier.currency;
  const a = i.adjustments.find((x) => x.label === FREIGHT_ADJUSTMENT_LABEL);
  if (a) return chargeValue(a, { amount: c.freight, currency: c.freightCurrency }, invoiceCurrency, i.charges.freight ? freightReasonText(i.charges.freight) : undefined);
  const incoterm = incotermCode(i.shipment.invoice.incoterm.value);
  if (!FREIGHT_NOT_INCLUDED.has(incoterm)) return { value: null, source: "SYSTEM", note: "Đã gồm trong giá hóa đơn" };
  if (i.charges.freight) return { value: null, source: "USER", suspect: true, note: `${incoterm}: chưa có số cước – ${freightReasonText(i.charges.freight)}. Bổ sung số cước trước khi truyền` };
  return { value: null, source: "SYSTEM", suspect: true, blocking: true, note: `${incoterm}: cần cước vận chuyển quốc tế – nhập số cước hoặc lý do chưa có ở bước OCR & kiểm tra` };
};

/** 1.48: CIF/CIP… không khai; người khai xác nhận không mua bảo hiểm → mã D. */
const insurance = (i: MappingInput): MappedValue => {
  const c = i.shipment.charges;
  const invoiceCurrency = i.shipment.invoice.currency.value ?? i.dossier.currency;
  if (INSURANCE_INCLUDED.has(incotermCode(i.shipment.invoice.incoterm.value))) return { value: null, source: "SYSTEM", note: "Đã gồm trong giá hóa đơn" };
  const a = i.adjustments.find((x) => x.label === INSURANCE_ADJUSTMENT_LABEL);
  if (a) return chargeValue(a, { amount: c.insurance, currency: c.insuranceCurrency }, invoiceCurrency);
  if (i.charges.insurance?.mode === "NONE") return { value: NO_INSURANCE_VALUE, source: "USER", note: "Người khai xác nhận không mua bảo hiểm" };
  // Không có chứng từ/số phí bảo hiểm và giá chưa gồm bảo hiểm → mã D (không bảo hiểm) – cách khai phổ biến; mua bảo hiểm thì nhập số phí ở bước OCR & kiểm tra.
  return { value: NO_INSURANCE_VALUE, source: "SYSTEM", note: "Không có chứng từ bảo hiểm – khai D (không bảo hiểm); nếu có mua bảo hiểm thì nhập phí bảo hiểm ở bước OCR & kiểm tra" };
};

/** 1.49: mỗi khoản một dòng (mã tên, AD/SB, mã tiền, trị giá). Phí khác đọc từ chứng từ chưa có mã → nghi ngờ (FPT chặn truyền). */
const otherAdjustments = (i: MappingInput): MappedValue => {
  const others = i.adjustments.filter((a) => a.label !== FREIGHT_ADJUSTMENT_LABEL && a.label !== INSURANCE_ADJUSTMENT_LABEL);
  if (!others.length) return { value: null, source: i.charges.adjustments ? "USER" : "SYSTEM" };
  const uncoded = others.filter((a) => !a.code);
  if (uncoded.length) {
    return {
      value: others.map((a) => `${a.code ? `${a.code} ` : ""}${a.label}: ${a.amount} ${a.currency}`).join("; "), source: uncoded[0]!.source, suspect: true,
      note: "Phí khác đọc từ chứng từ chưa có mã tên khoản điều chỉnh – lập danh sách khoản điều chỉnh ở bước OCR & kiểm tra",
    };
  }
  const noRate = others.filter((a) => !a.rate).map((a) => a.currency);
  return {
    value: formatAdjustmentField(others.map((a) => ({ code: a.code!, kind: a.kind === "SUBTRACT" ? "SB" : "AD", amount: a.amount, currency: a.currency, ...(a.allocate === false ? { allocate: false } : {}) }))), source: "USER",
    ...(noRate.length ? { suspect: true, note: `Chưa có tỷ giá cho ${[...new Set(noRate)].join(", ")}` } : {}),
  };
};

/**
 * 1.26 đường biển/sông: số vận đơn khai theo dạng ngày phát hành vận đơn DDMMYY + số vận đơn (khớp bản lược khai hàng hóa điện tử của hãng tàu),
 * vd 220425FANS25040166. Đã có tiền tố ngày thì giữ nguyên; thiếu ngày vận đơn → giữ số, đánh dấu để người khai bổ sung. AWB không thêm.
 */
function seaBillNo(i: MappingInput, v: MappedValue): MappedValue {
  if (!BY_WATER.test(i) || v.value === null) return v;
  const d = i.shipment.transport.departureDate.value;
  if (!d) return { ...v, suspect: true, note: "Thiếu ngày vận đơn – số vận đơn đường biển khai dạng DDMMYY + số vận đơn" };
  const prefix = `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(2, 4)}`;
  return v.value.startsWith(prefix) ? v : { ...v, value: `${prefix}${v.value}` };
}

/** 1.33 cảng dỡ: xét mọi chứng từ ghi cảng dỡ (B/L, Arrival Notice…) – bến cụ thể / tên trùng danh mục A016 thắng tên thành phố chung. */
function dischargePort(i: MappingInput): MappedValue {
  const t = i.shipment.transport;
  const raws = (s: typeof t.portOfDischarge) => [...new Set([s.value, ...s.sources.map((x) => x.raw)].filter((x): x is string => !!x))];
  const pick = pickDischargePort(raws(t.portOfDischarge), raws(t.finalDestination), i.catalogs?.ports, { air: i.dossier.transportMode === "AIR" });
  const ref = [...t.portOfDischarge.sources, ...t.finalDestination.sources].find((x) => x.raw === pick.raw);
  const source = ref ? sourceOfKind(ref.kind) : fromSourced(t.portOfDischarge, "BILL_OF_LADING").source;
  const base = port(pick.raw ?? t.portOfDischarge.value, pick.resolved, source);
  return pick.note ? { ...base, suspect: true, note: pick.note } : base;
}

/** 1.34 cảng xếp: mọi chứng từ ghi nơi đi; không có → suy từ địa chỉ người xuất khẩu (đánh dấu kiểm). */
function loadingPort(i: MappingInput): MappedValue {
  const { portOfLoading: pol } = i.shipment.transport;
  const seller = i.shipment.parties.seller;
  const raws = [...new Set([pol.value, ...pol.sources.map((x) => x.raw)].filter((x): x is string => !!x))];
  const addresses = [...new Set([seller.address.value, ...seller.address.sources.map((x) => x.raw)].filter((x): x is string => !!x))];
  const pick = pickLoadingPort(raws, addresses, seller.country.value, i.catalogs?.worldPorts);
  const ref = pol.sources.find((x) => x.raw === pick.raw);
  const source = ref ? sourceOfKind(ref.kind) : pick.note ? fromSourced(seller.address, "INVOICE").source : fromSourced(pol, "BILL_OF_LADING").source;
  const base = port(pick.raw, pick.resolved, source);
  return pick.note ? { ...base, suspect: true, note: pick.note } : base;
}

export const IDA_MAPPINGS: FieldMapping[] = [
  { code: "SOTK", no: N.SOTK, section: "GENERAL", label: "Số tờ khai", required: false, from: (i) => ({ value: i.dossier.declarationNo ?? "Chưa cấp – nhận sau khi truyền IDA", source: "SYSTEM" }) },
  { code: "MA_LH", no: N.MA_LH, section: "GENERAL", label: "Mã loại hình", required: true, from: (i) => ({ value: i.dossier.typeCode, source: "DOSSIER" }) },
  { code: "PTVC", no: N.PTVC, section: "GENERAL", label: "Mã phương thức vận chuyển", required: true, from: (i) => {
    const m = transportModeCode(i.dossier.transportMode, i.shipment.transport.containers.length > 0);
    return { value: `${m.code} – ${m.name}`, source: "DOSSIER", ...(m.note ? { suspect: true, note: m.note } : {}) };
  } },
  // Hồ sơ chọn khác mặc định (4) → theo hồ sơ; còn để mặc định → Mặc định khai báo của doanh nghiệp nếu có, không thì 4 – Tổ chức gửi tổ chức.
  // Ghi đè nguồn / giá trị cố định của doanh nghiệp vẫn chạy trước (evaluateMapping).
  { code: "PL_CN", no: N.PL_CN, section: "GENERAL", label: "Mã phân loại cá nhân/tổ chức", required: true, options: { sources: [profileSource("PL_CN")], allowFixed: true }, from: (i) => {
    const fromDossier: MappedValue = { value: `${i.dossier.partyClass} – ${PARTY_CLASS_LABELS[i.dossier.partyClass]}`, source: "DOSSIER" };
    return i.dossier.partyClass === DEFAULT_PARTY_CLASS ? profileOr(i, "PL_CN", fromDossier) : fromDossier;
  } },
  { code: "CQHQ", no: N.CQHQ, section: "GENERAL", label: "Mã cơ quan Hải quan", required: true, from: (i) => ({ value: i.dossier.customsOfficeName ? `${i.dossier.customsOfficeCode} – ${i.dossier.customsOfficeName}` : i.dossier.customsOfficeCode, source: "DOSSIER" }) },
  { code: "NGAY_DK", no: N.NGAY_DK, section: "GENERAL", label: "Ngày khai báo dự kiến", required: false, from: (i) => ({ value: vnDate(i.now), source: "SYSTEM" }) },
  { code: "TNTX_TK", no: N.TNTX_TK, section: "GENERAL", label: "Số tờ khai tạm xuất tương ứng", required: true, when: RE_IMPORT, from: () => ({ value: null, source: "DOSSIER", note: "Nhập số tờ khai tạm xuất (12 số) của lô hàng tái nhập; tờ khai tạm xuất phải còn hiệu lực" }) },
  { code: "HAN_TX", no: N.HAN_TX, section: "GENERAL", label: "Thời hạn tái xuất khẩu", required: true, when: TEMP_IMPORT, from: () => ({ value: null, source: "DOSSIER", note: "Nhập ngày hết hạn hàng tạm nhập được lưu tại Việt Nam theo quy định của loại hình" }) },

  { code: "NNK_MST", no: N.NNK_MST, section: "PARTIES", label: "Mã số thuế người nhập khẩu", required: true, from: (i) => ({ value: i.org.taxCode, source: "ACCOUNT" }) },
  { code: "NNK_TEN", no: N.NNK_TEN, section: "PARTIES", label: "Tên người nhập khẩu", required: true, from: (i) => ({ value: i.org.name, source: "ACCOUNT" }) },
  // 1.14 mã bưu chính: lấy từ Tài khoản (mã chỉ tiêu = tên ô VNACCS TK_IMY, cùng khóa ô bổ sung trên form đầy đủ nên sửa tay vẫn thắng – nguồn USER).
  // Phụ lục II ghi tùy chọn nhưng đặc tả FPT bắt buộc TK_IMY: còn trống thì khi truyền gửi "000000" kèm cảnh báo (integration/declaration-to-fpt).
  { code: "TK_IMY", no: "1.14", section: "PARTIES", label: "Mã bưu chính", required: false, from: (i) => (i.org.postalCode
    ? { value: i.org.postalCode, source: "ACCOUNT" }
    : { value: null, source: "ACCOUNT", note: "Chưa có mã bưu chính ở Tài khoản → Doanh nghiệp – khi truyền sẽ gửi 000000" }) },
  // 1.15 là chỉ tiêu HT (TT39): VNACCS tự hiện địa chỉ theo MST, người khai chỉ nhập khi hệ thống hiện sai → không bắt buộc, trống không chặn duyệt.
  { code: "NNK_DC", no: N.NNK_DC, section: "PARTIES", label: "Địa chỉ người nhập khẩu", required: false, from: (i) => ({ value: i.org.address || null, source: "ACCOUNT", ...(i.org.address ? {} : { note: "Chưa có địa chỉ ở Tài khoản – VNACCS tự hiện theo mã số thuế; cập nhật địa chỉ doanh nghiệp ở Tài khoản" }) }) },
  { code: "NNK_DT", no: N.NNK_DT, section: "PARTIES", label: "Số điện thoại người nhập khẩu", required: false, from: (i) => ({ value: i.org.phone || null, source: "ACCOUNT" }) },
  { code: "NXK_TEN", no: N.NXK_TEN, section: "PARTIES", label: "Tên người xuất khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.seller.name, "INVOICE") },
  { code: "NXK_DC", no: N.NXK_DC, section: "PARTIES", label: "Địa chỉ người xuất khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.seller.address, "INVOICE") },
  { code: "MA_NUOC", no: N.MA_NUOC, section: "PARTIES", label: "Mã nước người xuất khẩu", required: true, from: (i) => fromSourced(i.shipment.parties.seller.country, "INVOICE") },

  { code: "SO_VD", no: N.SO_VD, section: "TRANSPORT", label: "Số vận đơn", required: true, options: { sources: [SRC.houseBill, SRC.masterBill], allowFixed: false }, from: (i) => {
    const s = i.shipment.transport.billNo.value ? i.shipment.transport.billNo : i.shipment.transport.masterBillNo;
    return s.value ? seaBillNo(i, fromSourced(s, "BILL_OF_LADING")) : missing("BILL_OF_LADING", "Chưa có vận đơn (B/L hoặc AWB)");
  } },
  { code: "SO_KIEN", no: N.SO_KIEN, section: "TRANSPORT", label: "Số lượng kiện", required: true, from: (i) => packageCount(i, "Chưa có số kiện trên Packing List / vận đơn") },
  { code: "TRONG_LUONG", no: N.TRONG_LUONG, section: "TRANSPORT", label: "Tổng trọng lượng hàng (Gross)", required: true, from: (i) => {
    const g = fromSourced(i.shipment.transport.grossWeightKg, "PACKING_LIST");
    return g.value === null ? missing("PACKING_LIST", "Chưa có tổng trọng lượng") : { ...g, value: plainNumber(g.value) };
  } },
  { code: "KHO", no: N.KHO, section: "TRANSPORT", label: "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", required: true, options: { sources: [SRC.anWarehouse, profileSource("KHO")], allowFixed: true }, from: (i) =>
    warehouseFromAn(i) ?? profileOr(i, "KHO", missing("DOSSIER", "Chọn mã địa điểm lưu kho (kho/bãi/cảng nơi hàng chờ thông quan – CV 4613/TCHQ-VNACCS)")) },
  { code: "CANG_DO", no: N.CANG_DO, section: "TRANSPORT", label: "Mã địa điểm dỡ hàng", required: true, from: dischargePort },
  { code: "CANG_XEP", no: N.CANG_XEP, section: "TRANSPORT", label: "Mã địa điểm xếp hàng", required: true, from: loadingPort },
  { code: "HO_HIEU", no: N.HO_HIEU, section: "TRANSPORT", label: "Hô hiệu phương tiện (call sign)", required: false, when: BY_WATER, from: () => ({ ...fixed("9999"), note: "Ô 1 chỉ tiêu 1.31: hô hiệu tàu – điền sẵn 9999 (tàu chưa đăng ký trên hệ thống); B/L có hô hiệu thật thì sửa lại. Phương thức khác đường biển/sông: không có ô này" }) },
  // 1.35: hệ thống tự xuất nếu đã đăng ký; không khai khi đường hàng không / hàng rời / hàng CFS (mã 3).
  { code: "SL_CONT", no: N.SL_CONT, section: "TRANSPORT", label: "Số lượng container", required: false, when: IN_CONTAINER, from: (i) => {
    const n = i.shipment.transport.containers.length;
    return n ? { value: String(n), source: "BILL_OF_LADING" } : missing("BILL_OF_LADING", "Vận đơn chưa có số container");
  } },
  { code: "PTVC_TEN", no: N.PTVC_TEN, section: "TRANSPORT", label: "Tên phương tiện vận chuyển", required: true, from: (i) => {
    const v = fromSourced(i.shipment.transport.vessel, "BILL_OF_LADING");
    const voy = i.shipment.transport.voyage.value;
    return v.value === null ? missing("BILL_OF_LADING", "Chưa có tên tàu / chuyến bay") : { ...v, value: voy ? `${v.value} V.${voy}` : v.value };
  } },
  { code: "NGAY_DEN", no: N.NGAY_DEN, section: "TRANSPORT", label: "Ngày hàng đến", required: true, options: { sources: [SRC.arrivalDate, SRC.departureDate], allowFixed: false }, from: (i) => {
    const arr = i.shipment.transport.arrivalDate;
    const d = fromSourced(arr, "BILL_OF_LADING");
    if (d.value !== null && arr.sources[0]?.kind === "FREIGHT_INVOICE") return { ...d, suspect: true, note: "Chưa có Arrival Notice: tạm lấy ngày hóa đơn/thông báo cước (thường phát hành khi hàng về) – kiểm ngày hàng đến thực tế" };
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
  { code: "GP", no: N.GP, section: "VALUE", label: "Giấy phép nhập khẩu", required: false, from: (i) => permitsField(i, "IDA") },
  { code: "CT_TG", no: N.CT_TG, section: "VALUE", label: "Chi tiết khai trị giá", required: false, from: valuationDetail },
  { code: "PHI_VC", no: N.PHI_VC, section: "VALUE", label: "Phí vận chuyển", required: false, from: freight },
  { code: "PHI_BH", no: N.PHI_BH, section: "VALUE", label: "Phí bảo hiểm", required: false, from: insurance },
  { code: "KHOAN_DC", no: N.KHOAN_DC, section: "VALUE", label: "Khoản điều chỉnh khác", required: false, from: otherAdjustments },
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
  // Mô tả hàng ghi đã qua sử dụng (used, second-hand, refurbished…) → CU; còn lại MO (hàng mới – trường hợp thường gặp; hàng cũ cần giấy phép riêng).
  { code: "VBPQ", no: N.VBPQ, section: "GENERAL", label: "Mã văn bản pháp quy khác", required: false, from: (i) => {
    const ch = i.shipment.items.filter((_, k) => /^(84|85)/.test(lineHs(i)[k] ?? ""));
    if (!ch.length) return { value: null, source: "SYSTEM" };
    const used = ch.filter((it) => USED_GOODS.test(it.description.value ?? "")).map((it) => it.lineNo);
    if (used.length === ch.length) return { value: "CU", source: "INVOICE", blocking: true, note: `Mô tả hàng ghi hàng đã qua sử dụng – CU (CV 2061/TCHQ-GSQL); kiểm tra điều kiện nhập khẩu hàng đã qua sử dụng` };
    if (used.length) return { value: "MO", source: "INVOICE", suspect: true, blocking: true, note: `Dòng ${used.join(", ")} ghi hàng đã qua sử dụng nhưng dòng khác là hàng mới – một tờ khai chỉ khai một mã ô 1 (MO/CU): tách tờ khai` };
    return { value: "MO", source: "SYSTEM", blocking: true, note: `${ch.length} dòng chương 84/85, mô tả không ghi đã qua sử dụng → MO (máy móc, thiết bị chưa qua sử dụng – CV 2061/TCHQ-GSQL). Hàng đã qua sử dụng thì đổi thành CU` };
  } },
  { code: "NGUOI_NT", no: N.NGUOI_NT, section: "GENERAL", label: "Người nộp thuế", required: true, options: { sources: [profileSource("NGUOI_NT")], allowFixed: true }, from: (i) => profileOr(i, "NGUOI_NT", fixed("1 – Người nhập khẩu")) },
  { code: "GHI_CHU", no: N.GHI_CHU, section: "GENERAL", label: "Phần ghi chú", required: false, from: (i) => {
    const c = i.shipment.transport.containers;
    const co = coRef(i);
    // Ghi chú của hồ sơ là ghi chú nội bộ (“không gửi Hải quan”) – không đưa vào Phần ghi chú của tờ khai.
    const parts = [co?.text, c.length ? `Container: ${c.map((x) => x.no).join(", ")}` : null].filter(Boolean);
    const value = parts.length ? parts.join("; ") : null;
    return co && !co.dated ? { value, source: "DOSSIER", suspect: true, note: "Bổ sung ngày cấp C/O sau số C/O (TT121, chỉ tiêu 1.68)" } : { value, source: "DOSSIER" };
  } },
  { code: "SO_QLNB", no: N.SO_QLNB, section: "GENERAL", label: "Số quản lý nội bộ doanh nghiệp", required: false, from: (i) => ({ value: i.dossier.code, source: "DOSSIER" }) },
];
