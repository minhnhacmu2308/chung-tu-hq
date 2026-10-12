// Dựng tờ khai từ dữ liệu lô hàng – bản mô phỏng của phần "code + cấu hình" (ADR 0002, không dùng AI).
// Dùng chung cho seed (tờ khai có sẵn) và api/declaration (tờ khai dựng khi agent chạy xong).
// Biểu thuế/HS dưới đây là DỮ LIỆU MẪU cho prototype, không dùng để khai thật.
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
    loadingPort: "KRPUS – Busan",
    dischargePort: "VNTVU – Cảng Tân Vũ (Hải Phòng)",
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
    loadingPort: "CNYTN – Yantian",
    dischargePort: "VNHPH – Cảng Hải Phòng",
    arrivalInDays: 0,
    packages: "126 CT",
    grossKg: "5420.00",
    paymentTerm: "TTR",
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
    loadingPort: "ITGOA – Genova",
    dischargePort: "VNHPH – Cảng Hải Phòng",
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

const DEFAULT_SHIPMENT = (d: Dossier): ShipmentInfo => ({
  invoiceNo: `INV-${d.code.split("-").pop()}`,
  invoiceDaysAgo: 8,
  sellerAddress: "—",
  countryCode: d.partner.includes("SHENZHEN") ? "CN" : d.partner.includes("ARTEMIDE") ? "IT" : d.partner.includes("MORINAGA") ? "JP" : d.partner.includes("TAIWAN") ? "TW" : d.partner.includes("NORDIC") ? "SE" : d.partner.includes("PACIFIC") ? "SG" : "KR",
  loadingPort: d.transportMode === "AIR" ? "Sân bay đi" : "Cảng xếp hàng",
  dischargePort: d.transportMode === "AIR" ? "VNHAN – Sân bay Nội Bài" : "VNHPH – Cảng Hải Phòng",
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

const TRANSPORT_LABEL = { SEA: "2 – Đường biển (container)", AIR: "1 – Đường hàng không", ROAD: "3 – Đường bộ" } as const;

/** Dựng tờ khai nháp IDA (nhập) / EDA (xuất). */
export function buildDeclaration(d: Dossier, items: LineItem[], org: Organization): Declaration {
  const s = shipmentOf(d);
  const t = computeTaxes(d, items, s.adjustments);
  const nk = d.direction === "NK";
  const f = (section: DeclarationField["section"], code: string, label: string, value: string, source: ValueSource): DeclarationField => ({
    section,
    code,
    label,
    value,
    source,
    ...(s.suspect.includes(code) ? { suspect: true } : {}),
  });
  const orgParty = [
    f("PARTIES", nk ? "NNK_MST" : "NXK_MST", nk ? "Mã số thuế người nhập khẩu" : "Mã số thuế người xuất khẩu", org.taxCode, "ACCOUNT"),
    f("PARTIES", nk ? "NNK_TEN" : "NXK_TEN", nk ? "Tên người nhập khẩu" : "Tên người xuất khẩu", org.name, "ACCOUNT"),
    f("PARTIES", nk ? "NNK_DC" : "NXK_DC", "Địa chỉ", org.address, "ACCOUNT"),
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
    f("GENERAL", "PL_CN", "Mã phân loại cá nhân/tổ chức", "4 – Tổ chức gửi tổ chức", "DEFAULT"),
    ...orgParty,
    ...partner,
    f("TRANSPORT", "SO_VD", d.transportMode === "AIR" ? "Số vận đơn (AWB)" : "Số vận đơn (B/L)", d.billNo || "—", "BILL_OF_LADING"),
    f("TRANSPORT", "PTVC", "Phương thức vận chuyển", TRANSPORT_LABEL[d.transportMode], "DOSSIER"),
    f("TRANSPORT", "CANG_XEP", "Địa điểm xếp hàng", s.loadingPort, "BILL_OF_LADING"),
    f("TRANSPORT", "CANG_DO", "Địa điểm dỡ hàng", s.dischargePort, "BILL_OF_LADING"),
    f("TRANSPORT", "NGAY_DEN", nk ? "Ngày hàng đến" : "Ngày hàng đi dự kiến", isoDayOffset(s.arrivalInDays), "BILL_OF_LADING"),
    f("TRANSPORT", "SO_KIEN", "Số lượng kiện", s.packages, "PACKING_LIST"),
    f("TRANSPORT", "TRONG_LUONG", "Tổng trọng lượng hàng (gross, kg)", s.grossKg, "PACKING_LIST"),
    f("VALUE", "SO_HD", "Số hóa đơn", s.invoiceNo, "INVOICE"),
    f("VALUE", "NGAY_HD", "Ngày phát hành hóa đơn", isoDayOffset(-s.invoiceDaysAgo), "INVOICE"),
    f("VALUE", "DK_GIA", "Điều kiện giá hóa đơn", d.incoterm, "INVOICE"),
    f("VALUE", "PT_TT", "Phương thức thanh toán", s.paymentTerm, "CONTRACT"),
    f("VALUE", "MA_TT", "Mã đồng tiền", d.currency, "INVOICE"),
    f("VALUE", "TONG_TG", "Tổng trị giá hóa đơn", t.invoiceTotal, "INVOICE"),
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
    valueAdjustments: s.adjustments,
    estimatedImportDutyVnd: t.importDutyVnd,
    estimatedVatVnd: t.vatVnd,
  };
}
