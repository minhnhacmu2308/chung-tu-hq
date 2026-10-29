// Dựng tờ khai từ dữ liệu lô hàng – bản mô phỏng của phần "code + cấu hình" (ADR 0002, không dùng AI).
// Dùng chung cho seed (tờ khai có sẵn) và api/declaration (tờ khai dựng khi agent chạy xong).
// Biểu thuế/HS dưới đây là DỮ LIỆU MẪU cho prototype, không dùng để khai thật.
import { PARTY_CLASS_LABELS, TRANSPORT_MODE_INFO } from "@kb/contracts";
import { applyRate, fromMinor, sumMinor, toMinor } from "@/lib/decimal";
import type { Declaration, DeclarationField, Dossier, IsoDate, LineItem, Organization, ValueSource } from "./types";

export type HsEntry = {
  code: string;
  description: string;
  mfn: string; // thuế NK ưu đãi (MFN), %
  pref?: Partial<Record<"AK" | "EVFTA", string>>; // thuế suất ưu đãi đặc biệt theo FTA
  vat: string;
  policy?: string;
};

export const HS_CATALOG: HsEntry[] = [
  { code: "8482.10.00", description: "Ổ bi cầu", mfn: "3", pref: { AK: "0" }, vat: "8" },
  { code: "8482.20.00", description: "Ổ bi đũa côn, kể cả cụm nón và đũa côn", mfn: "3", pref: { AK: "0" }, vat: "8" },
  { code: "8482.40.00", description: "Ổ bi đũa kim, kể cả lồng và cụm đũa kim", mfn: "3", pref: { AK: "0" }, vat: "8" },
  { code: "8482.50.00", description: "Các loại ổ bi đũa trụ khác", mfn: "3", pref: { AK: "0" }, vat: "8" },
  { code: "8482.80.00", description: "Ổ bi loại khác, kể cả ổ kết hợp bi cầu/bi đũa", mfn: "3", pref: { AK: "0" }, vat: "8" },
  { code: "8466.93.90", description: "Bộ phận và phụ kiện khác của máy công cụ thuộc nhóm 84.56 đến 84.61", mfn: "0", pref: { AK: "0" }, vat: "8" },
  { code: "8483.10.90", description: "Trục truyền động – loại khác", mfn: "3", pref: { AK: "0" }, vat: "8" },
  { code: "8483.20.90", description: "Thân ổ, có lắp ổ bi – loại khác", mfn: "3", pref: { AK: "0" }, vat: "8" },
  { code: "8483.30.90", description: "Thân ổ, không lắp ổ bi; gối đỡ trục dùng ổ trượt – loại khác", mfn: "3", pref: { AK: "0" }, vat: "8" },
  { code: "8483.40.90", description: "Bộ bánh răng; vít bi hoặc vít đũa; hộp số – loại khác", mfn: "5", pref: { AK: "0" }, vat: "8" },
  { code: "8501.51.19", description: "Động cơ xoay chiều đa pha, công suất không quá 750 W – loại khác", mfn: "5", vat: "8" },
  { code: "8501.31.40", description: "Động cơ một chiều, công suất không quá 750 W – loại khác", mfn: "5", vat: "8" },
  { code: "8504.40.90", description: "Bộ biến đổi điện tĩnh – loại khác", mfn: "3", vat: "8" },
  {
    code: "9405.11.90",
    description: "Đèn chùm, đèn treo trần hoặc gắn tường, chỉ dùng nguồn sáng LED – loại khác",
    mfn: "20",
    pref: { EVFTA: "10" },
    vat: "8",
    policy: "Kiểm tra nhà nước về chất lượng (QCVN 19:2019/BKHCN – đèn LED)",
  },
  {
    code: "9405.21.90",
    description: "Đèn bàn, đèn giường, đèn cây, chỉ dùng nguồn sáng LED – loại khác",
    mfn: "20",
    pref: { EVFTA: "10" },
    vat: "8",
    policy: "Kiểm tra nhà nước về chất lượng (QCVN 19:2019/BKHCN – đèn LED)",
  },
];

export const findHs = (code: string | undefined) => HS_CATALOG.find((h) => h.code === code);

/** Thông tin lô hàng ngoài dòng hàng (bản mô phỏng kết quả đọc chứng từ đã gộp). */
export type ShipmentInfo = {
  invoiceNo: string;
  invoiceDaysAgo: number;
  sellerAddress: string;
  countryCode: string;
  loadingPort: string;
  dischargePort: string;
  arrivalInDays: number;
  packages: string;
  grossKg: string;
  paymentTerm: string;
  /** Mã địa điểm lưu kho (A202). null = chưa có (hồ sơ trình diễn chặn duyệt khi thiếu ô bắt buộc); không ghi = kho mặc định của chi cục. */
  storage?: string | null;
  coForm?: "AK" | "EVFTA";
  coNo?: string;
  adjustments: Declaration["valueAdjustments"];
  /** Mã chỉ tiêu còn nghi ngờ (đánh dấu trên tờ khai). */
  suspect: string[];
  suspectNotes?: Record<string, string>;
};

const SHIPMENTS: Record<string, ShipmentInfo> = {
  dos_021: {
    invoiceNo: "HSP-2610-0457",
    invoiceDaysAgo: 9,
    sellerAddress: "77 Gongdan-ro 140beon-gil, Changwon-si, Gyeongsangnam-do, Korea",
    countryCode: "KR",
    loadingPort: "KRPUS – BUSAN",
    dischargePort: "VNHPN – CANG TAN VU - HP",
    arrivalInDays: 1,
    packages: "48 PK",
    grossKg: "3860.50",
    paymentTerm: "TTR",
    coForm: "AK",
    coNo: "KR2610-0457-AK",
    adjustments: [
      { label: "Cước vận chuyển quốc tế – hóa đơn cước GTGT số 0004512", amount: "1150.00", currency: "USD", source: "SYSTEM" },
    ],
    suspect: ["CANG_DO"],
    suspectNotes: { CANG_DO: "B/L ghi HCM, Arrival Notice ghi Hải Phòng – đã chọn điểm đến cuối tại Việt Nam" },
  },
  dos_023: {
    invoiceNo: "KD20261003",
    invoiceDaysAgo: 6,
    sellerAddress: "No. 18 Baolong 6th Rd, Longgang District, Shenzhen, Guangdong, China",
    countryCode: "CN",
    loadingPort: "CNYTN – YANTIAN",
    dischargePort: "VNHPH – CANG HAI PHONG",
    arrivalInDays: 0,
    packages: "126 CT",
    grossKg: "5420.00",
    paymentTerm: "TTR",
    storage: null,
    adjustments: [{ label: "Cước vận chuyển quốc tế – theo Arrival Notice", amount: "1380.00", currency: "USD", source: "BILL_OF_LADING" }],
    suspect: ["TRONG_LUONG", "TY_GIA"],
    suspectNotes: {
      TRONG_LUONG: "Packing List 5.420,00 kg – B/L 5.402,00 kg",
      TY_GIA: "Tỷ giá theo ngày khai dự kiến, sẽ cập nhật khi đăng ký",
    },
  },
  dos_024: {
    invoiceNo: "AI-26-00981",
    invoiceDaysAgo: 12,
    sellerAddress: "Via Bergamo 18, 20010 Pregnana Milanese (MI), Italy",
    countryCode: "IT",
    loadingPort: "ITGOA – GENOA",
    dischargePort: "VNHPH – CANG HAI PHONG",
    arrivalInDays: 2,
    packages: "22 PK",
    grossKg: "1284.00",
    paymentTerm: "TTR",
    coForm: "EVFTA",
    coNo: "REX IT00123456789 (tự chứng nhận trên invoice)",
    adjustments: [
      { label: "Cước vận chuyển quốc tế – hóa đơn cước của forwarder", amount: "640.00", currency: "EUR", source: "SYSTEM" },
      { label: "Phí lấy hàng tại kho người bán (EXW)", amount: "180.00", currency: "EUR", source: "INVOICE" },
    ],
    suspect: [],
  },
};

/** Địa chỉ đối tác mô phỏng theo nước (hồ sơ không có dữ liệu lô hàng riêng) – 1.22/2.21 dòng 1 là ô bắt buộc. */
const PARTNER_ADDRESS: Record<string, string> = {
  CN: "No. 18 Baolong 6th Rd, Longgang District, Shenzhen, China",
  IT: "Via Bergamo 18, 20010 Pregnana Milanese (MI), Italy",
  JP: "2-4-1 Shibakoen, Minato-ku, Tokyo 105-0011, Japan",
  TW: "No. 7 Jingke Rd, Nantun District, Taichung City, Taiwan",
  SE: "Industrigatan 12, 211 24 Malmo, Sweden",
  SG: "51 Changi Business Park Central 2, Singapore 486066",
  KR: "45 Gongdan-ro 140beon-gil, Changwon-si, Gyeongsangnam-do, Korea",
};
const countryOf = (d: Dossier) =>
  d.partner.includes("SHENZHEN") ? "CN" : d.partner.includes("ARTEMIDE") ? "IT" : d.partner.includes("MORINAGA") ? "JP" : d.partner.includes("TAIWAN") ? "TW" : d.partner.includes("NORDIC") ? "SE" : d.partner.includes("PACIFIC") ? "SG" : "KR";

const DEFAULT_SHIPMENT = (d: Dossier): ShipmentInfo => ({
  invoiceNo: `INV-${d.code.split("-").pop()}`,
  invoiceDaysAgo: 8,
  sellerAddress: PARTNER_ADDRESS[countryOf(d)]!,
  countryCode: countryOf(d),
  loadingPort: d.transportMode === "AIR" ? "Sân bay đi" : "Cảng xếp hàng",
  dischargePort: d.transportMode === "AIR" ? "VNNFW – CT TNHH ALSC" : "VNHPH – CANG HAI PHONG",
  arrivalInDays: -3,
  packages: "12 PK",
  grossKg: "980.00",
  paymentTerm: "TTR",
  adjustments: ["FCA", "EXW", "FOB", "FAS"].includes(d.incoterm)
    ? [{ label: "Cước vận chuyển quốc tế", amount: "420.00", currency: d.currency, source: "BILL_OF_LADING" as ValueSource }]
    : [],
  suspect: [],
});

export const shipmentOf = (d: Dossier): ShipmentInfo => SHIPMENTS[d.id] ?? DEFAULT_SHIPMENT(d);

/** Kho mặc định theo chi cục (mã thuộc danh mục A202 của chi cục đó). */
const STORAGE_BY_OFFICE: Record<string, string> = { "03CE": "03CEC01", "01B1": "01B1A02", "02CI": "02CIC01" };
/** Tên phương tiện / chuyến và hô hiệu mô phỏng (đọc từ B/L, AWB). */
const vesselOf = (d: Dossier) => (d.transportMode === "AIR" ? "VN0313" : "COSCO ARIES / 041S");

/** Tỷ giá tính thuế mẫu (VND / 1 đơn vị ngoại tệ). */
export const EXCHANGE_RATES: Record<string, number> = { USD: 26_150, EUR: 30_420, JPY: 175 };

const isoDayOffset = (n: number): IsoDate => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Thuế suất NK/VAT cho một mã HS theo loại hình + xuất xứ ưu đãi. */
export function ratesFor(d: Dossier, code: string): { importDutyRate: string; vatRate: string; policyNote?: string } {
  if (d.direction === "XK") return { importDutyRate: "0", vatRate: "0", policyNote: "Hàng xuất khẩu – thuế XK 0%" };
  const hs = findHs(code);
  if (!hs) return { importDutyRate: "0", vatRate: "8" };
  if (d.typeCode === "E21") return { importDutyRate: "0", vatRate: "0", policyNote: "Loại hình E21 (SXXK): miễn thuế NK, không thu VAT khâu nhập khẩu" };
  const co = shipmentOf(d).coForm;
  const pref = co ? hs.pref?.[co] : undefined;
  return {
    importDutyRate: pref ?? hs.mfn,
    vatRate: hs.vat,
    ...(hs.policy ? { policyNote: hs.policy } : pref !== undefined ? { policyNote: `Áp thuế suất ưu đãi đặc biệt ${co === "AK" ? "AKFTA (C/O form AK)" : "EVFTA (REX)"}` } : {}),
  };
}

export type ItemTax = { itemId: string; customsValueVnd: string; importDutyVnd: string; vatVnd: string };

/** Phân bổ khoản cộng theo tỷ lệ trị giá, tính thuế từng dòng. Mọi phép tính trên số nguyên. */
export function computeTaxes(d: Dossier, items: LineItem[], adjustments: Declaration["valueAdjustments"]) {
  const rate = EXCHANGE_RATES[d.currency] ?? 26_150;
  const amounts = items.map((i) => toMinor(i.amount));
  const invoiceMinor = sumMinor(amounts);
  const adjMinor = sumMinor(adjustments.filter((a) => a.currency === d.currency).map((a) => toMinor(a.amount)));
  const totalVnd = Math.round(((invoiceMinor + adjMinor) * rate) / 100);

  let allocated = 0;
  const perItem: ItemTax[] = items.map((it, idx) => {
    const isLast = idx === items.length - 1;
    const share = invoiceMinor === 0 ? 0 : Math.round((totalVnd * amounts[idx]!) / invoiceMinor);
    const valueVnd = isLast ? totalVnd - allocated : share;
    allocated += valueVnd;
    const duty = applyRate(valueVnd, it.importDutyRate ?? "0");
    const vat = applyRate(valueVnd + duty, it.vatRate ?? "0");
    return { itemId: it.id, customsValueVnd: fromMinor(valueVnd, 0), importDutyVnd: fromMinor(duty, 0), vatVnd: fromMinor(vat, 0) };
  });
  return {
    exchangeRate: String(rate),
    invoiceTotal: fromMinor(invoiceMinor),
    customsValueVnd: fromMinor(totalVnd, 0),
    importDutyVnd: fromMinor(sumMinor(perItem.map((p) => Number(p.importDutyVnd))), 0),
    vatVnd: fromMinor(sumMinor(perItem.map((p) => Number(p.vatVnd))), 0),
    perItem,
  };
}

const transportLabel = (m: Dossier["transportMode"]) => `${TRANSPORT_MODE_INFO[m].code} – ${TRANSPORT_MODE_INFO[m].label}`;

const EXPORT_NO_DEDUCTION = new Set(["EXW", "FCA", "FAS", "FOB", "DAP", "DAF"]);

/** Số chỉ tiêu Phụ lục II (giống packages/core declaration/domain/mapping/numbers.ts) – để màn Review hiện hướng dẫn khai theo catalog. */
const FIELD_NO: Record<"IDA" | "EDA", Record<string, string>> = {
  IDA: {
    SOTK: "1.1", MA_LH: "1.4", PTVC: "1.6", PL_CN: "1.7", CQHQ: "1.8", NGAY_DK: "1.11", NNK_MST: "1.12", NNK_TEN: "1.13", TK_IMY: "1.14", NNK_DC: "1.15",
    NXK_TEN: "1.20", NXK_DC: "1.22", MA_NUOC: "1.23", SO_VD: "1.26", SO_KIEN: "1.27", TRONG_LUONG: "1.28", NGAY_DEN: "1.32", CANG_DO: "1.33", CANG_XEP: "1.34",
    SO_HD: "1.41", NGAY_HD: "1.42", PT_TT: "1.43", DK_GIA: "1.44", MA_TT: "1.44", TONG_TG: "1.44",
    KHO: "1.29", PTVC_TEN: "1.31", HD_PL: "1.39", GIA_PL: "1.44",
    GP: "1.38", CT_TG: "1.50", NGUOI_NT: "1.52", HO_HIEU: "1.31", HAN_TX: "1.10", TNTX_TK: "1.3",
  },
  EDA: {
    SOTK: "2.1", MA_LH: "2.4", PTVC: "2.6", CQHQ: "2.8", NGAY_DK: "2.10", NXK_MST: "2.11", NXK_TEN: "2.12", TK_EPP: "2.13", NXK_DC: "2.14",
    NNK_TEN: "2.19", NNK_DC: "2.21", MA_NUOC: "2.22", SO_VD: "2.24", SO_KIEN: "2.25", TRONG_LUONG: "2.26", CANG_DO: "2.28", CANG_XEP: "2.29", NGAY_DEN: "2.31",
    SO_HD: "2.36", NGAY_HD: "2.37", PT_TT: "2.38", DK_GIA: "2.39", MA_TT: "2.39", TONG_TG: "2.39",
    KHO: "2.27", PTVC_TEN: "2.30", HD_PL: "2.34", GIA_PL: "2.39", NXK_DT: "2.15",
    GP: "2.33", TG_TT: "2.40", NGUOI_NT: "2.43", VBPQ: "2.80", HO_HIEU: "2.30", HAN_TN: "2.7", TNTX_TK: "2.3",
  },
};

/** Dựng tờ khai nháp IDA (nhập) / EDA (xuất). */
export function buildDeclaration(d: Dossier, items: LineItem[], org: Organization): Declaration {
  const s = shipmentOf(d);
  const nk = d.direction === "NK";
  // Tờ khai xuất: trị giá hải quan là giá tại cửa khẩu xuất – FOB/nhóm E, F không cộng cước; giá đã gồm cước/bảo hiểm thì trừ ra (giống backend planExportAdjustments).
  const adjustments = nk ? s.adjustments : EXPORT_NO_DEDUCTION.has(d.incoterm) ? [] : s.adjustments.map((a) => ({ ...a, amount: a.amount.startsWith("-") ? a.amount.slice(1) : `-${a.amount}` }));
  const t = computeTaxes(d, items, adjustments);
  const numbers = FIELD_NO[nk ? "IDA" : "EDA"];
  const f = (section: DeclarationField["section"], code: string, label: string, value: string, source: ValueSource): DeclarationField => ({
    section,
    code,
    ...(numbers[code] ? { no: numbers[code] } : {}),
    label,
    value,
    source,
    ...(s.suspect.includes(code) ? { suspect: true } : {}),
  });
  const when = (field: DeclarationField, condition: string): DeclarationField => ({ ...field, condition });
  const orgParty = [
    f("PARTIES", nk ? "NNK_MST" : "NXK_MST", nk ? "Mã số thuế người nhập khẩu" : "Mã số thuế người xuất khẩu", org.taxCode, "ACCOUNT"),
    f("PARTIES", nk ? "NNK_TEN" : "NXK_TEN", nk ? "Tên người nhập khẩu" : "Tên người xuất khẩu", org.name, "ACCOUNT"),
    // Mã bưu chính (1.14 / 2.13) từ Tài khoản – mã chỉ tiêu = tên ô VNACCS như backend.
    f("PARTIES", nk ? "TK_IMY" : "TK_EPP", "Mã bưu chính", org.postalCode ?? "", "ACCOUNT"),
    f("PARTIES", nk ? "NNK_DC" : "NXK_DC", "Địa chỉ", org.address, "ACCOUNT"),
    ...(nk ? [] : [f("PARTIES", "NXK_DT", "Số điện thoại người xuất khẩu", org.phone, "ACCOUNT")]),
  ];
  const partner = [
    f("PARTIES", nk ? "NXK_TEN" : "NNK_TEN", nk ? "Tên người xuất khẩu (nước ngoài)" : "Tên người nhập khẩu (nước ngoài)", d.partner, "INVOICE"),
    f("PARTIES", nk ? "NXK_DC" : "NNK_DC", "Địa chỉ đối tác", s.sellerAddress, "INVOICE"),
    f("PARTIES", "MA_NUOC", "Mã nước", s.countryCode, "INVOICE"),
  ];
  const fields: DeclarationField[] = [
    f("GENERAL", "SOTK", "Số tờ khai", d.declarationNo ?? "Chưa cấp – nhận sau khi truyền IDA", "SYSTEM"),
    f("GENERAL", "MA_LH", "Mã loại hình", d.typeCode, "DOSSIER"),
    f("GENERAL", "CQHQ", "Cơ quan Hải quan", d.customsOffice, "DOSSIER"),
    f("GENERAL", "NGAY_DK", "Ngày khai dự kiến", isoDayOffset(0), "SYSTEM"),
    ...(nk ? [f("GENERAL", "PL_CN", "Mã phân loại cá nhân/tổ chức", `${d.partyClass} – ${PARTY_CLASS_LABELS[d.partyClass]}`, "DOSSIER")] : []),
    ...orgParty,
    ...partner,
    f("TRANSPORT", "SO_VD", d.transportMode === "AIR" ? "Số vận đơn (AWB)" : "Số vận đơn (B/L)", d.billNo || "—", "BILL_OF_LADING"),
    f("TRANSPORT", "PTVC", "Phương thức vận chuyển", transportLabel(d.transportMode), "DOSSIER"),
    f("TRANSPORT", "CANG_XEP", "Địa điểm xếp hàng", s.loadingPort, "BILL_OF_LADING"),
    f("TRANSPORT", "CANG_DO", "Địa điểm dỡ hàng", s.dischargePort, "BILL_OF_LADING"),
    f("TRANSPORT", "NGAY_DEN", nk ? "Ngày hàng đến" : "Ngày hàng đi dự kiến", isoDayOffset(s.arrivalInDays), "BILL_OF_LADING"),
    f("TRANSPORT", "SO_KIEN", "Số lượng kiện", s.packages, "PACKING_LIST"),
    f("TRANSPORT", "KHO", "Mã địa điểm lưu kho hàng chờ thông quan", s.storage === undefined ? STORAGE_BY_OFFICE[d.customsOffice.slice(0, 4)] ?? "" : s.storage ?? "", "BILL_OF_LADING"),
    f("TRANSPORT", "PTVC_TEN", d.transportMode === "AIR" ? "Số chuyến bay" : "Tên tàu / số chuyến", vesselOf(d), "BILL_OF_LADING"),
    f("TRANSPORT", "TRONG_LUONG", "Tổng trọng lượng hàng (gross, kg)", s.grossKg, "PACKING_LIST"),
    f("VALUE", "HD_PL", "Phân loại hình thức hóa đơn", "A – Hóa đơn thương mại", "DEFAULT"),
    f("VALUE", "SO_HD", "Số hóa đơn", s.invoiceNo, "INVOICE"),
    f("VALUE", "NGAY_HD", "Ngày phát hành hóa đơn", isoDayOffset(-s.invoiceDaysAgo), "INVOICE"),
    f("VALUE", "GIA_PL", "Mã phân loại giá hóa đơn", "A – Giá hóa đơn cho hàng hóa phải trả tiền", "DEFAULT"),
    f("VALUE", "DK_GIA", "Điều kiện giá hóa đơn", d.incoterm, "INVOICE"),
    f("VALUE", "PT_TT", "Phương thức thanh toán", s.paymentTerm, "CONTRACT"),
    f("VALUE", "MA_TT", "Mã đồng tiền", d.currency, "INVOICE"),
    f("VALUE", "TONG_TG", "Tổng trị giá hóa đơn", t.invoiceTotal, "INVOICE"),
    f("VALUE", "GP", nk ? "Giấy phép nhập khẩu" : "Giấy phép xuất khẩu", "", "DOSSIER"),
    ...(nk
      ? [f("VALUE", "CT_TG", "Chi tiết khai trị giá", `${isoDayOffset(-s.invoiceDaysAgo).split("-").reverse().join("")}#&`, "BILL_OF_LADING")]
      : [
          ...(["FOB", "DAP", "DAF"].includes(d.incoterm) ? [] : [when(f("VALUE", "TG_TT", "Trị giá tính thuế", `${t.invoiceTotal} ${d.currency}`, "SYSTEM"), "Điều kiện giá khác FOB/DAP/DAF hoặc không có hóa đơn")]),
          f("VALUE", "VBPQ", "Mã văn bản pháp luật khác (theo dòng hàng)", "", "DOSSIER"),
        ]),
    // Chỉ tiêu theo tình huống (giống backend mapping/conditions.ts).
    ...(nk && /^G1[1-4]$/.test(d.typeCode) ? [when(f("GENERAL", "HAN_TX", "Thời hạn tái xuất khẩu", "", "DOSSIER"), "Loại hình tạm nhập (G11–G14)")] : []),
    ...(nk && d.typeCode === "G51" ? [when(f("GENERAL", "TNTX_TK", "Số tờ khai tạm xuất tương ứng", "", "DOSSIER"), "Loại hình tái nhập hàng đã tạm xuất (G51)")] : []),
    ...(!nk && /^G2[1-4]$/.test(d.typeCode) ? [when(f("GENERAL", "TNTX_TK", "Số tờ khai tạm nhập tương ứng", "", "DOSSIER"), "Loại hình tái xuất hàng đã tạm nhập (G21–G24)")] : []),
    ...(!nk && d.typeCode === "G61" ? [when(f("GENERAL", "HAN_TN", "Thời hạn tái nhập khẩu", "", "DOSSIER"), "Loại hình tạm xuất (G61)")] : []),
    ...(d.transportMode === "SEA_CONTAINER" || d.transportMode === "SEA_BULK" || d.transportMode === "RIVER"
      ? [when(f("TRANSPORT", "HO_HIEU", "Hô hiệu phương tiện (call sign)", "9999", "DEFAULT"), "Vận chuyển đường biển / đường sông (mã 2, 3, 6)")]
      : []),
    f("GENERAL", "NGUOI_NT", "Người nộp thuế", nk ? "1 – Người nhập khẩu" : "1 – Người xuất khẩu", "DEFAULT"),
    f("VALUE", "TY_GIA", "Tỷ giá tính thuế", t.exchangeRate, "SYSTEM"),
    ...(s.coNo ? [f("VALUE", "SO_CO", s.coForm === "EVFTA" ? "Chứng từ chứng nhận xuất xứ (REX)" : "Số C/O (form AK)", s.coNo, "CERT_OF_ORIGIN")] : []),
  ];
  return {
    dossierId: d.id,
    kind: nk ? "IDA" : "EDA",
    status: "DRAFT",
    fields,
    exchangeRate: t.exchangeRate,
    exchangeRateDate: isoDayOffset(0),
    customsValueVnd: t.customsValueVnd,
    valueAdjustments: adjustments,
    estimatedImportDutyVnd: t.importDutyVnd,
    estimatedVatVnd: t.vatVnd,
  };
}
