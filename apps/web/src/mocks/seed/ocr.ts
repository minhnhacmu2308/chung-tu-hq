// Dữ liệu mẫu bước 3 (OCR & kiểm tra): trường trích xuất + kết quả đối chiếu chéo.
// Hồ sơ trình diễn dos_021 có dữ liệu chi tiết, khớp nhau giữa các chứng từ (và lệch đúng chỗ cần lệch).
// Hồ sơ khác: sinh tự động từ chứng từ (generateFieldsForDocument) – cũng dùng khi người dùng upload chứng từ mới.
// Vị trí (region) tính bằng bố cục chuẩn dưới đây; màn hình dựng lại trang chứng từ theo đúng các vùng này.
import type { CrossCheck, DocKind, Dossier, DossierDocument, ExtractedField, FieldStatus, LineItem, Region } from "../types";
import { SHOWCASE_DOSSIER_ID } from "./core";

/* ---------------- Bố cục trang (đơn vị % trang) ---------------- */

export const LAYOUT = {
  top: 15, // dòng trường đầu tiên (dưới tiêu đề)
  rowH: 7, // mỗi dòng: nhãn in + ô giá trị
  valueOffset: 2.3,
  valueH: 3.6,
  colX: [8, 52] as const,
  colW: 40,
  wideW: 84,
  itemRowH: 4.4,
  itemCols: {
    description: { x: 14, w: 34 }, quantity: { x: 49, w: 10 }, unit: { x: 60, w: 7 }, unit_price: { x: 68, w: 10 }, amount: { x: 79, w: 11 }, origin: { x: 91, w: 6 },
  },
} as const;

type Def = {
  key: string;
  label: string;
  value: string;
  status?: FieldStatus;
  note?: string;
  group: ExtractedField["group"];
  /** Chiếm cả dòng (địa chỉ, tên dài). */
  wide?: boolean;
  page?: number;
};

const ITEM_KEY = /^item\.(\d+)\.(description|quantity|unit|unit_price|amount|origin)$/;

/** Gán vùng cho từng trường theo bố cục chuẩn: trường thường xếp 2 cột, dòng hàng thành bảng phía dưới. */
function layoutFields(documentId: string, defs: Def[]): ExtractedField[] {
  const out: ExtractedField[] = [];
  const pages = [...new Set(defs.map((d) => d.page ?? 1))];
  for (const page of pages) {
    const onPage = defs.filter((d) => (d.page ?? 1) === page);
    let row = 0;
    let col: 0 | 1 = 0;
    for (const d of onPage.filter((x) => x.group !== "ITEMS")) {
      if (d.wide && col === 1) {
        row++;
        col = 0;
      }
      const y = LAYOUT.top + row * LAYOUT.rowH + LAYOUT.valueOffset;
      const region: Region = d.wide
        ? { page, x: LAYOUT.colX[0], y, w: LAYOUT.wideW, h: LAYOUT.valueH }
        : { page, x: LAYOUT.colX[col], y, w: LAYOUT.colW, h: LAYOUT.valueH };
      out.push(toField(documentId, d, region));
      if (d.wide || col === 1) {
        row++;
        col = 0;
      } else col = 1;
    }
    if (col === 1) row++;
    const tableTop = LAYOUT.top + row * LAYOUT.rowH + 6; // chừa chỗ cho dòng tiêu đề bảng
    for (const d of onPage.filter((x) => x.group === "ITEMS")) {
      const m = ITEM_KEY.exec(d.key);
      if (!m) continue;
      const line = Number(m[1]);
      const c = LAYOUT.itemCols[m[2] as keyof typeof LAYOUT.itemCols];
      out.push(toField(documentId, d, { page, x: c.x, y: tableTop + (line - 1) * LAYOUT.itemRowH, w: c.w, h: LAYOUT.itemRowH - 0.6 }));
    }
  }
  return out;
}

function toField(documentId: string, d: Def, region: Region): ExtractedField {
  return {
    id: `fld_${documentId}_${d.key}`,
    documentId,
    group: d.group,
    key: d.key,
    label: d.label,
    value: d.value,
    originalValue: d.value,
    status: d.status ?? "CROSS_CHECKED",
    region,
    ...(d.note ? { note: d.note } : {}),
  };
}

/** Trạng thái cần người xem lại (đếm vào "trường nghi ngờ"). */
export const SUSPECT_STATUSES: readonly FieldStatus[] = ["CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE"];

/* ---------------- Hồ sơ trình diễn dos_021 ---------------- */

const BUYER_EN = "AN PHAT INDUSTRIAL EQUIPMENT CO., LTD";
const BUYER_NOTE = "Tên tiếng Anh – tờ khai dùng tên theo MST 0316789012: CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT";
const INV_NO = "HPS-INV-2610-078";

/** Dòng hàng trên invoice: [mô tả, số lượng, thành tiền, đơn giá, (trạng thái nghi ngờ, "ô ghi chú")]; ĐVT "PCE", xuất xứ "KR" như invoice mẫu. */
const items = (rows: [string, string, string, string, FieldStatus?, string?][]): Def[] =>
  rows.flatMap(([description, quantity, amount, unitPrice, unsure, note], i) => {
    const n = i + 1;
    const st = (k: "description" | "quantity" | "amount"): Pick<Def, "status" | "note"> =>
      unsure && note?.startsWith(k) ? { status: unsure, note: note.slice(k.length + 1) } : {};
    return [
      { key: `item.${n}.description`, label: `Dòng ${n} – Mô tả`, value: description, group: "ITEMS", ...st("description") },
      { key: `item.${n}.quantity`, label: `Dòng ${n} – Số lượng`, value: quantity, group: "ITEMS", ...st("quantity") },
      { key: `item.${n}.unit`, label: `Dòng ${n} – Đơn vị`, value: "PCE", group: "ITEMS" },
      { key: `item.${n}.unit_price`, label: `Dòng ${n} – Đơn giá`, value: unitPrice, group: "ITEMS" },
      { key: `item.${n}.amount`, label: `Dòng ${n} – Thành tiền (USD)`, value: amount, group: "ITEMS", ...st("amount") },
      { key: `item.${n}.origin`, label: `Dòng ${n} – Xuất xứ`, value: "KR", group: "ITEMS" },
    ] satisfies Def[];
  });

const SHOWCASE: Record<string, Def[]> = {
  // Commercial Invoice – 2 trang
  doc_021_1: [
    { key: "invoice_no", label: "Số hóa đơn", value: INV_NO, group: "GENERAL" },
    { key: "invoice_date", label: "Ngày hóa đơn", value: "2026-10-02", group: "GENERAL" },
    { key: "po_no", label: "Số PO", value: "AP-2609-114", group: "GENERAL", status: "SINGLE_SOURCE" },
    { key: "vessel", label: "Tàu / chuyến", value: "SITC HAIPHONG V.2641S", group: "TRANSPORT", status: "MODEL_UNSURE", note: "Chữ in mờ – B/L ghi SITC HAIPHONG V.2641S" },
    { key: "seller_name", label: "Người bán", value: "HANSOL PRECISION CO., LTD.", group: "PARTIES", wide: true },
    { key: "seller_address", label: "Địa chỉ người bán", value: "45, Gongdan-ro 140beon-gil, Seongsan-gu, Changwon-si, Gyeongsangnam-do, KOREA", group: "PARTIES", wide: true, status: "SINGLE_SOURCE" },
    { key: "buyer_name", label: "Người mua", value: BUYER_EN, group: "PARTIES", wide: true, status: "CONFLICT", note: BUYER_NOTE },
    { key: "buyer_tax_code", label: "MST người mua", value: "031678901", group: "PARTIES", status: "INVALID_FORMAT", note: "MST phải có 10 hoặc 13 chữ số – MST đăng ký: 0316789012" },
    { key: "port_loading", label: "Cảng xếp hàng", value: "CHANGWON (MASAN), KOREA", group: "TRANSPORT" },
    ...items([
      ["DEEP GROOVE BALL BEARING 6205-2RS", "600 PCS", "2910.00", "4.85"],
      ["TAPERED ROLLER BEARING 30208", "320 PCS", "4288.00", "13.40"],
      ["LINEAR GUIDE RAIL HGR20 L=1000MM", "120 PCS", "8220.00", "68.50", "MODEL_UNSURE", "quantity Chữ số mờ: có thể là 120 hoặc 12O – tổng số lượng khớp Packing List nếu là 120"],
      ["LINEAR BLOCK HGH20CA", "200 PCS", "5432.00", "27.16", "MODEL_UNSURE", "description Mã HGH20CA hay HGH20CC – ký tự cuối bị nhòe"],
    ]),
    { key: "incoterm", label: "Điều kiện giao hàng", value: "FCA CHANGWON", group: "COMMERCIAL", page: 2 },
    { key: "currency", label: "Đồng tiền", value: "USD", group: "COMMERCIAL", page: 2 },
    { key: "total_quantity", label: "Tổng số lượng", value: "1240 PCS", group: "COMMERCIAL", page: 2 },
    { key: "total_amount", label: "Tổng trị giá", value: "20850.00", group: "COMMERCIAL", page: 2 },
    { key: "payment_terms", label: "Điều kiện thanh toán", value: "T/T 30 DAYS AFTER B/L DATE", group: "COMMERCIAL", page: 2, status: "SINGLE_SOURCE" },
    { key: "country_of_origin", label: "Xuất xứ", value: "KOREA", group: "COMMERCIAL", page: 2 },
  ],
  // Packing List
  doc_021_2: [
    { key: "invoice_ref", label: "Số invoice tham chiếu", value: INV_NO, group: "GENERAL" },
    { key: "pl_date", label: "Ngày Packing List", value: "2026-10-02", group: "GENERAL" },
    { key: "packages", label: "Số kiện", value: "18 PALLETS", group: "TRANSPORT" },
    { key: "gross_weight", label: "Trọng lượng cả bì", value: "3860.50 KGS", group: "TRANSPORT" },
    { key: "net_weight", label: "Trọng lượng tịnh", value: "3612.00 KGS", group: "TRANSPORT", status: "SINGLE_SOURCE" },
    { key: "measurement", label: "Thể tích", value: "21.35 CBM", group: "TRANSPORT", status: "CONFLICT", note: "B/L ghi 21.53 CBM (có thể đảo chữ số)" },
    { key: "shipping_marks", label: "Ký mã hiệu", value: "AN PHAT / HAIPHONG / P/NO. 1-18", group: "GENERAL", wide: true, status: "MODEL_UNSURE", note: "Ký mã hiệu in nghiêng, đọc chưa chắc phần số kiện" },
    { key: "total_quantity", label: "Tổng số lượng", value: "1240 PCS", group: "COMMERCIAL" },
  ],
  // Bill of Lading – 2 trang (trang 2 là điều khoản in sẵn)
  doc_021_3: [
    { key: "bl_no", label: "Số B/L", value: "HPSEL2610078", group: "GENERAL" },
    { key: "onboard_date", label: "Ngày xếp hàng lên tàu", value: "2026-10-05", group: "GENERAL", status: "MODEL_UNSURE", note: "Dấu \"Shipped on board\" đóng mờ – ngày đọc được: 05/10/2026" },
    { key: "shipper", label: "Người gửi hàng", value: "HANSOL PRECISION CO., LTD.", group: "PARTIES", wide: true },
    { key: "consignee", label: "Người nhận hàng", value: "TO ORDER OF VIETCOMBANK - HAI PHONG BRANCH", group: "PARTIES", wide: true, status: "SINGLE_SOURCE" },
    { key: "notify_party", label: "Bên được thông báo", value: BUYER_EN, group: "PARTIES", wide: true, status: "CONFLICT", note: BUYER_NOTE },
    { key: "vessel", label: "Tàu / chuyến", value: "SITC HAIPHONG V.2641S", group: "TRANSPORT" },
    { key: "container", label: "Container / seal", value: "SITU2614507 / 40HC / KR884120", group: "TRANSPORT", status: "SINGLE_SOURCE" },
    { key: "port_loading", label: "Cảng xếp hàng", value: "CHANGWON (MASAN), KOREA", group: "TRANSPORT" },
    { key: "port_transshipment", label: "Cảng chuyển tải", value: "BUSAN, KOREA", group: "TRANSPORT", status: "SINGLE_SOURCE" },
    { key: "port_discharge", label: "Cảng dỡ hàng", value: "HAI PHONG, VIETNAM", group: "TRANSPORT" },
    { key: "freight_terms", label: "Điều kiện cước", value: "FREIGHT COLLECT", group: "COMMERCIAL" },
    { key: "packages", label: "Số kiện", value: "18 PALLETS", group: "TRANSPORT" },
    { key: "gross_weight", label: "Trọng lượng cả bì", value: "3860.50 KGS", group: "TRANSPORT" },
    { key: "measurement", label: "Thể tích", value: "21.53 CBM", group: "TRANSPORT", status: "CONFLICT", note: "Packing List ghi 21.35 CBM" },
  ],
  // C/O form AK
  doc_021_4: [
    { key: "co_no", label: "Số C/O", value: "KR2610-0457-AK", group: "GENERAL" },
    { key: "co_form", label: "Mẫu C/O", value: "FORM AK", group: "GENERAL" },
    { key: "issue_date", label: "Ngày cấp", value: "2026-10-06", group: "GENERAL" },
    { key: "invoice_ref", label: "Invoice tham chiếu", value: `${INV_NO} / 2026-10-02`, group: "GENERAL" },
    { key: "exporter", label: "Nhà xuất khẩu", value: "HANSOL PRECISION CO., LTD.", group: "PARTIES", wide: true },
    { key: "importer", label: "Nhà nhập khẩu", value: BUYER_EN, group: "PARTIES", wide: true, status: "SINGLE_SOURCE" },
    { key: "origin_criterion", label: "Tiêu chí xuất xứ", value: "CTH", group: "COMMERCIAL", status: "MODEL_UNSURE", note: "Ô 8 in chồng – có thể là CTH hoặc CTSH" },
    { key: "hs_codes", label: "Mã HS trên C/O", value: "8482.10; 8482.20; 8482.99", group: "COMMERCIAL", status: "MODEL_UNSURE", note: "Thiếu mã cho ray dẫn hướng (dòng 3) – sẽ đối chiếu sau khi tra HS" },
  ],
  // Arrival Notice
  doc_021_5: [
    { key: "bl_no", label: "Số B/L", value: "HPSEL2610078", group: "GENERAL" },
    { key: "eta", label: "Ngày hàng đến (ETA)", value: "2026-10-11", group: "TRANSPORT", status: "CONFLICT", note: "Lịch tàu trên cùng trang ghi ETA 12/10/2026" },
    { key: "vessel", label: "Tàu / chuyến", value: "SITC HAIPHONG V.2641S", group: "TRANSPORT" },
    { key: "container", label: "Container", value: "SITU2614507 / 40HC", group: "TRANSPORT" },
    { key: "ocean_freight", label: "Cước biển", value: "1150.00 USD", group: "COMMERCIAL" },
    { key: "local_charges", label: "Phí địa phương", value: "4,860,000 VND", group: "COMMERCIAL", status: "MODEL_UNSURE", note: "Bảng phí có 2 cột (USD/VND) – kiểm tra lại tổng" },
  ],
  // Hóa đơn GTGT cước
  doc_021_6: [
    { key: "einvoice_no", label: "Số hóa đơn", value: "0004512", group: "GENERAL" },
    { key: "einvoice_symbol", label: "Ký hiệu", value: "1C26TSB", group: "GENERAL", status: "MODEL_UNSURE", note: "Ký tự thứ 4 có thể là 2 hoặc Z" },
    { key: "issue_date", label: "Ngày hóa đơn", value: "2026-10-11", group: "GENERAL" },
    { key: "seller", label: "Đơn vị bán", value: "CÔNG TY TNHH TIẾP VẬN SAO BIỂN", group: "PARTIES", wide: true },
    { key: "seller_tax_code", label: "MST đơn vị bán", value: "0201988345", group: "PARTIES" },
    { key: "buyer_tax_code", label: "MST người mua", value: "0316789012", group: "PARTIES" },
    { key: "ocean_freight", label: "Cước vận chuyển quốc tế", value: "1150.00 USD", group: "COMMERCIAL" },
    { key: "exchange_rate", label: "Tỷ giá trên hóa đơn", value: "25340", group: "COMMERCIAL", status: "SINGLE_SOURCE", note: "Tỷ giá của forwarder – tờ khai dùng tỷ giá tính thuế theo ngày" },
    { key: "freight_amount_vnd", label: "Thành tiền (VND)", value: "29141000", group: "COMMERCIAL", status: "INVALID_FORMAT", note: "1.150 × 25.340 = 29.141.000 – hóa đơn in 29.141.00 (thiếu số 0)" },
  ],
};

const SHOWCASE_CHECKS: Omit<CrossCheck, "id" | "dossierId">[] = [
  { ruleCode: "R-FREIGHT-INCOTERM", title: "FCA: chưa cộng cước vận chuyển vào trị giá", detail: "Trị giá invoice 20.850,00 USD là giá FCA. Đã tìm thấy hóa đơn cước 0004512: 1.150,00 USD – cần cộng vào trị giá tính thuế ở bước Review tờ khai.", result: "FAIL", severity: "BLOCKER", documentKinds: ["INVOICE", "FREIGHT_INVOICE", "ARRIVAL_NOTICE"] },
  { ruleCode: "R-BUYER-TAXCODE", title: "Tên người mua là tên tiếng Anh, MST sai định dạng", detail: "Tờ khai dùng tên và MST theo đăng ký của doanh nghiệp: CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT – 0316789012.", result: "WARN", severity: "WARNING", documentKinds: ["INVOICE", "BILL_OF_LADING"] },
  { ruleCode: "R-CBM-PL-BL", title: "Thể tích Packing List lệch B/L", detail: "Packing List 21,35 CBM – B/L 21,53 CBM (có thể đảo chữ số). Không ảnh hưởng thuế.", result: "WARN", severity: "INFO", documentKinds: ["PACKING_LIST", "BILL_OF_LADING"] },
  { ruleCode: "R-WEIGHT-PL-BL", title: "Trọng lượng Packing List khớp B/L", detail: "Gross weight 3.860,50 kg = 3.860,50 kg · 18 pallets.", result: "PASS", severity: "WARNING", documentKinds: ["PACKING_LIST", "BILL_OF_LADING"] },
  { ruleCode: "R-INVOICE-REF", title: "Số invoice khớp trên Packing List và C/O", detail: `${INV_NO} ngày 02/10/2026 xuất hiện đúng trên cả 3 chứng từ.`, result: "PASS", severity: "BLOCKER", documentKinds: ["INVOICE", "PACKING_LIST", "CERT_OF_ORIGIN"] },
  { ruleCode: "R-QTY-INV-PL", title: "Tổng số lượng invoice khớp Packing List", detail: "1.240 PCS trên cả hai chứng từ (4 dòng hàng).", result: "PASS", severity: "WARNING", documentKinds: ["INVOICE", "PACKING_LIST"] },
  { ruleCode: "R-AMOUNT-SUM", title: "Tổng tiền bằng tổng các dòng hàng", detail: "2.910,00 + 4.288,00 + 8.220,00 + 5.432,00 = 20.850,00 USD.", result: "PASS", severity: "BLOCKER", documentKinds: ["INVOICE"] },
  { ruleCode: "R-CO-PREFERENCE", title: "C/O form AK hợp lệ cho ưu đãi AKFTA", detail: "Nhà xuất khẩu, số và ngày invoice trên C/O khớp; ngày cấp 06/10/2026 sau ngày xếp hàng 05/10/2026 (cấp sau – cần ô \"Issued retroactively\" nếu > 3 ngày).", result: "PASS", severity: "WARNING", documentKinds: ["CERT_OF_ORIGIN", "INVOICE", "BILL_OF_LADING"] },
  { ruleCode: "R-PORT-TRANSSHIP", title: "Có cảng chuyển tải BUSAN", detail: "Tờ khai dùng cảng xếp CHANGWON (KRMAS) và cảng dỡ cuối cùng tại Việt Nam: HẢI PHÒNG (VNHPH).", result: "PASS", severity: "INFO", documentKinds: ["BILL_OF_LADING"] },
  { ruleCode: "R-CO-HS", title: "Đối chiếu mã HS trên C/O với dòng hàng", detail: "Chờ tra mã HS 8 số ở bước AI Agent xử lý.", result: "SKIPPED", severity: "INFO", documentKinds: ["CERT_OF_ORIGIN"] },
];

/* ---------------- Sinh tự động cho hồ sơ khác / chứng từ mới upload ---------------- */

/** Bảng hàng trên invoice của hồ sơ đã có dòng hàng mẫu – cùng số liệu với dòng hàng để sửa ở OCR thấy tờ khai đổi theo. */
const lineDefs = (lines: LineItem[]): Def[] =>
  lines.flatMap(({ lineNo: n, description, quantity, unit, unitPrice, amount, origin }) => [
    { key: `item.${n}.description`, label: `Dòng ${n} – Mô tả`, value: description, group: "ITEMS" },
    { key: `item.${n}.quantity`, label: `Dòng ${n} – Số lượng`, value: quantity, group: "ITEMS" },
    { key: `item.${n}.unit`, label: `Dòng ${n} – Đơn vị`, value: unit, group: "ITEMS" },
    { key: `item.${n}.unit_price`, label: `Dòng ${n} – Đơn giá`, value: unitPrice, group: "ITEMS" },
    { key: `item.${n}.amount`, label: `Dòng ${n} – Thành tiền`, value: amount, group: "ITEMS" },
    { key: `item.${n}.origin`, label: `Dòng ${n} – Xuất xứ`, value: origin, group: "ITEMS" },
  ] satisfies Def[]);

function genericDefs(kind: DocKind, d: Dossier): Def[] {
  const ref = d.code.split("-").pop() ?? "001";
  const value = d.invoiceValue === "0" ? "12480.00" : d.invoiceValue;
  const portLoad = d.transportMode === "AIR" ? "INCHEON INT'L AIRPORT (ICN)" : "SHANGHAI, CHINA";
  const portDis = d.transportMode === "AIR" ? "NOI BAI, HANOI (HAN)" : "HAI PHONG, VIETNAM";
  switch (kind) {
    case "INVOICE":
      return [
        { key: "invoice_no", label: "Số hóa đơn", value: `INV-${ref}-2610`, group: "GENERAL" },
        { key: "invoice_date", label: "Ngày hóa đơn", value: d.createdAt.slice(0, 10), group: "GENERAL" },
        { key: "seller_name", label: "Người bán", value: d.partner, group: "PARTIES", wide: true },
        { key: "buyer_name", label: "Người mua", value: BUYER_EN, group: "PARTIES", wide: true, status: "SINGLE_SOURCE" },
        { key: "incoterm", label: "Điều kiện giao hàng", value: d.incoterm, group: "COMMERCIAL" },
        { key: "currency", label: "Đồng tiền", value: d.currency, group: "COMMERCIAL" },
        { key: "total_amount", label: "Tổng trị giá", value, group: "COMMERCIAL" },
        { key: "country_of_origin", label: "Xuất xứ", value: d.partner.includes("S.P.A") ? "ITALY" : d.partner.includes("AB") ? "SWEDEN" : "CHINA", group: "COMMERCIAL" },
      ];
    case "PACKING_LIST":
      return [
        { key: "invoice_ref", label: "Số invoice tham chiếu", value: `INV-${ref}-2610`, group: "GENERAL" },
        { key: "packages", label: "Số kiện", value: "12 CARTONS", group: "TRANSPORT" },
        { key: "gross_weight", label: "Trọng lượng cả bì", value: "846.00 KGS", group: "TRANSPORT" },
        { key: "net_weight", label: "Trọng lượng tịnh", value: "792.40 KGS", group: "TRANSPORT", status: "SINGLE_SOURCE" },
      ];
    case "BILL_OF_LADING":
    case "AIR_WAYBILL":
      return [
        { key: "bl_no", label: kind === "AIR_WAYBILL" ? "Số AWB" : "Số B/L", value: d.billNo || `BL${ref}2610`, group: "GENERAL" },
        { key: "shipper", label: "Người gửi hàng", value: d.partner, group: "PARTIES", wide: true },
        { key: "port_loading", label: "Nơi xếp hàng", value: portLoad, group: "TRANSPORT" },
        { key: "port_discharge", label: "Nơi dỡ hàng", value: portDis, group: "TRANSPORT" },
        { key: "packages", label: "Số kiện", value: "12 CARTONS", group: "TRANSPORT" },
        { key: "gross_weight", label: "Trọng lượng cả bì", value: "846.00 KGS", group: "TRANSPORT" },
      ];
    case "CERT_OF_ORIGIN":
      return [
        { key: "co_no", label: "Số C/O", value: `E26-${ref}-0091`, group: "GENERAL" },
        { key: "co_form", label: "Mẫu C/O", value: "FORM E", group: "GENERAL" },
        { key: "exporter", label: "Nhà xuất khẩu", value: d.partner, group: "PARTIES", wide: true },
      ];
    case "FREIGHT_INVOICE":
      return [
        { key: "einvoice_no", label: "Số hóa đơn", value: `000${ref}7`, group: "GENERAL" },
        { key: "ocean_freight", label: "Cước vận chuyển quốc tế", value: "420.00 USD", group: "COMMERCIAL" },
      ];
    case "ARRIVAL_NOTICE":
      return [
        { key: "eta", label: "Ngày hàng đến (ETA)", value: d.dueDate, group: "TRANSPORT" },
        { key: "ocean_freight", label: "Cước", value: "420.00 USD", group: "COMMERCIAL" },
      ];
    default:
      return [{ key: "title", label: "Tiêu đề chứng từ", value: "DOCUMENT", group: "GENERAL", status: "MODEL_UNSURE", note: "Chưa nhận diện được loại chứng từ" }];
  }
}

/**
 * Trường cho một chứng từ của hồ sơ thường. `suspect` = số trường đánh dấu nghi ngờ
 * (đã xác nhận nếu hồ sơ đã qua bước OCR). `lines`: dòng hàng mẫu của hồ sơ – thành bảng hàng trên invoice.
 */
export function generateFieldsForDocument(doc: DossierDocument, dossier: Dossier, suspect = 0, confirmed = false, lines: LineItem[] = []): ExtractedField[] {
  const defs = genericDefs(doc.kind, dossier).map((d, i): Def => {
    if (i >= suspect || d.status === "MODEL_UNSURE") return d;
    if (confirmed) return { ...d, status: "USER_CONFIRMED" };
    return i % 2 === 0
      ? { ...d, status: "MODEL_UNSURE", note: "Chữ in mờ – kiểm tra lại với chứng từ gốc" }
      : { ...d, status: "CONFLICT", note: "Giá trị khác với chứng từ khác trong bộ" };
  });
  return layoutFields(doc.id, doc.kind === "INVOICE" ? [...defs, ...lineDefs(lines)] : defs);
}

export function generateChecks(dossier: Dossier, kinds: DocKind[]): CrossCheck[] {
  const has = (k: DocKind) => kinds.includes(k);
  const bill = kinds.find((k) => k === "BILL_OF_LADING" || k === "AIR_WAYBILL");
  const list: Omit<CrossCheck, "id" | "dossierId">[] = [];
  if (has("INVOICE") && has("PACKING_LIST")) list.push({ ruleCode: "R-INVOICE-REF", title: "Số invoice khớp Packing List", detail: "Số và ngày invoice trùng khớp.", result: "PASS", severity: "BLOCKER", documentKinds: ["INVOICE", "PACKING_LIST"] });
  if (has("PACKING_LIST") && bill) list.push({ ruleCode: "R-WEIGHT-PL-BL", title: "Trọng lượng Packing List khớp vận đơn", detail: "846,00 kg = 846,00 kg · 12 kiện.", result: "PASS", severity: "WARNING", documentKinds: ["PACKING_LIST", bill] });
  if (["EXW", "FCA", "FAS", "FOB"].includes(dossier.incoterm)) {
    const ok = has("FREIGHT_INVOICE") || has("ARRIVAL_NOTICE");
    list.push({
      ruleCode: "R-FREIGHT-INCOTERM",
      title: ok ? `${dossier.incoterm}: đã có chứng từ cước` : `${dossier.incoterm}: thiếu cước vận chuyển`,
      detail: ok ? "Cước sẽ được cộng vào trị giá tính thuế." : `Điều kiện ${dossier.incoterm} phải cộng cước quốc tế vào trị giá – bộ chứng từ chưa có hóa đơn cước hoặc Arrival Notice.`,
      result: ok ? "PASS" : "FAIL",
      severity: "BLOCKER",
      documentKinds: ["INVOICE"],
    });
  }
  list.push({ ruleCode: "R-BUYER-TAXCODE", title: "Tên người mua là tên tiếng Anh", detail: "Tờ khai dùng tên theo MST 0316789012.", result: "WARN", severity: "WARNING", documentKinds: ["INVOICE"] });
  return list.map((c, i) => ({ ...c, id: `chk_${dossier.id}_${i + 1}`, dossierId: dossier.id }));
}

/* ---------------- Seed ---------------- */

/** Hồ sơ đã qua bước upload → đã có kết quả đọc. */
const PAST_UPLOAD = new Set(["ocr", "agent", "review", "submit"]);

export function seedOcr(dossiers: Dossier[], documents: DossierDocument[], lineItems: LineItem[] = []): { fields: ExtractedField[]; checks: CrossCheck[] } {
  const fields: ExtractedField[] = [];
  const checks: CrossCheck[] = [];
  for (const d of dossiers) {
    if (d.status === "DRAFT" || !PAST_UPLOAD.has(d.step)) continue;
    const docs = documents.filter((x) => x.dossierId === d.id);
    if (d.id === SHOWCASE_DOSSIER_ID) {
      for (const doc of docs) fields.push(...layoutFields(doc.id, SHOWCASE[doc.id] ?? []));
      checks.push(...SHOWCASE_CHECKS.map((c, i) => ({ ...c, id: `chk_${d.id}_${i + 1}`, dossierId: d.id })));
      continue;
    }
    // Phân bổ số trường nghi ngờ của hồ sơ lên các chứng từ
    const atOcr = d.step === "ocr";
    let left = atOcr ? d.suspectFields : 2;
    docs.forEach((doc, i) => {
      const n = i === docs.length - 1 ? left : Math.min(left, Math.ceil(left / (docs.length - i)));
      left -= n;
      fields.push(...generateFieldsForDocument(doc, d, n, !atOcr, lineItems.filter((l) => l.dossierId === d.id)));
    });
    checks.push(...generateChecks(d, docs.map((x) => x.kind)));
  }
  return { fields, checks };
}
