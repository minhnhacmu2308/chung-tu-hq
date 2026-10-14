// Dữ liệu skill mẫu (template) – bản sao của apps/web/src/mocks/seed/skills.ts; đổi ở cả hai nơi khi sửa.
// Skill = cách đọc 1 loại chứng từ (trường, alias nhãn) hoặc cách ánh xạ sang tờ khai (MAPPING: key = mã chỉ tiêu VNACCS).
import type { Skill, SkillField } from "@kb/contracts";

const t = (offsetDays: number) => new Date(Date.now() - offsetDays * 86_400_000).toISOString();

type F = [key: string, label: string, type: SkillField["type"], required: boolean, aliases: string, decl?: string | undefined, extract?: boolean, display?: boolean];
const fields = (rows: F[]): SkillField[] =>
  rows.map(([key, label, type, required, aliases, decl, extract = true, display = true]) => ({
    key,
    label,
    type,
    required,
    aliases: aliases ? aliases.split("|") : [],
    ...(decl ? { declarationField: decl } : {}),
    extract,
    display,
  }));

const INVOICE_FIELDS: F[] = [
  ["invoice_no", "Số hóa đơn", "code", true, "Invoice No.|Inv. No|Invoice Number|Số HĐ", "Số hóa đơn thương mại"],
  ["invoice_date", "Ngày hóa đơn", "date", true, "Invoice Date|Date|Ngày", "Ngày phát hành hóa đơn"],
  ["seller", "Người bán", "party", true, "Seller|Shipper|Exporter|Beneficiary", "Người xuất khẩu"],
  ["buyer", "Người mua", "party", true, "Buyer|Consignee|Sold to|Messrs", "Người nhập khẩu"],
  ["incoterm", "Điều kiện giao hàng", "code", true, "Terms of Delivery|Price Terms|Incoterms|Trade Terms", "Điều kiện giá hóa đơn"],
  ["currency", "Mã tiền tệ", "code", true, "Currency|CUR", "Mã đồng tiền của hóa đơn"],
  ["total_amount", "Tổng trị giá", "decimal", true, "Total Amount|Grand Total|Total|Amount Due", "Tổng trị giá hóa đơn"],
  ["payment_terms", "Phương thức thanh toán", "string", false, "Payment Terms|Payment|Terms of Payment", "Phương thức thanh toán"],
  ["po_no", "Số PO", "code", false, "P/O No.|PO Number|Order No.|Your Ref", undefined, true, false],
  ["items", "Danh sách hàng hóa", "items", true, "Description of Goods|Commodity|Item", "Danh sách hàng"],
  ["bank_info", "Thông tin ngân hàng", "string", false, "Bank|Beneficiary Bank|SWIFT", undefined, false, false],
];

const SKILLS: Skill[] = [
  {
    id: "sk_inv_gen", code: "SK-INV-GEN", name: "Commercial Invoice – chung", kind: "DOCUMENT", docKind: "INVOICE",
    language: "Đa ngôn ngữ (EN/VI/ZH)", version: 7, accuracy: 0.962, labeledSamples: 48, updatedAt: t(3), enabled: true,
    fields: fields(INVOICE_FIELDS),
  },
  {
    id: "sk_pl_gen", code: "SK-PL-GEN", name: "Packing List – chung", kind: "DOCUMENT", docKind: "PACKING_LIST",
    language: "Đa ngôn ngữ (EN/VI/ZH)", version: 5, accuracy: 0.948, labeledSamples: 36, updatedAt: t(9), enabled: true,
    fields: fields([
      ["pl_no", "Số Packing List", "code", false, "Packing List No.|P/L No.|Ref No."],
      ["invoice_ref", "Số hóa đơn tham chiếu", "code", true, "Invoice No.|Inv. Ref"],
      ["packages", "Số kiện", "decimal", true, "Total Packages|No. of Pkgs|CTNS|Số kiện", "Số lượng kiện"],
      ["package_unit", "Đơn vị kiện", "code", true, "Package Type|Unit|PK|CT|PL", "Mã đơn vị tính kiện"],
      ["gross_weight", "Tổng trọng lượng (GW)", "decimal", true, "Gross Weight|G.W.|Total G/W|Tổng trọng lượng", "Tổng trọng lượng hàng (Gross)"],
      ["net_weight", "Trọng lượng tịnh (NW)", "decimal", false, "Net Weight|N.W.|Total N/W"],
      ["measurement", "Thể tích (CBM)", "decimal", false, "Measurement|CBM|Volume", undefined, true, false],
      ["items", "Danh sách hàng hóa", "items", true, "Description|Item|Marks & Nos"],
    ]),
  },
  {
    id: "sk_bl_gen", code: "SK-BL-GEN", name: "Bill of Lading – chung", kind: "DOCUMENT", docKind: "BILL_OF_LADING",
    language: "Tiếng Anh", version: 6, accuracy: 0.971, labeledSamples: 41, updatedAt: t(6), enabled: true,
    fields: fields([
      ["bl_no", "Số vận đơn", "code", true, "B/L No.|Bill of Lading No.|BL Number", "Số vận đơn"],
      ["shipper", "Người gửi hàng", "party", true, "Shipper|Shipper/Exporter"],
      ["consignee", "Người nhận hàng", "party", true, "Consignee|Consigned to"],
      ["notify", "Bên được thông báo", "party", false, "Notify Party|Also Notify", undefined, true, false],
      ["vessel", "Tên tàu / chuyến", "string", true, "Vessel|Ocean Vessel|Voy. No.", "Tên phương tiện vận chuyển"],
      ["pol", "Cảng xếp hàng", "code", true, "Port of Loading|POL", "Địa điểm xếp hàng"],
      ["pod", "Cảng dỡ hàng", "code", true, "Port of Discharge|POD|Place of Delivery", "Địa điểm dỡ hàng"],
      ["onboard_date", "Ngày xếp hàng", "date", true, "Shipped on Board|On Board Date|Laden on Board", "Ngày hàng đến (ước tính)"],
      ["containers", "Số container", "code", false, "Container No.|CNTR|Seal No.", "Số hiệu container"],
      ["gross_weight", "Tổng trọng lượng", "decimal", true, "Gross Weight|G.W.|KGS", "Tổng trọng lượng hàng (Gross)"],
    ]),
  },
  {
    id: "sk_awb_gen", code: "SK-AWB-GEN", name: "Air Waybill (MAWB/HAWB)", kind: "DOCUMENT", docKind: "AIR_WAYBILL",
    language: "Tiếng Anh", version: 3, accuracy: 0.934, labeledSamples: 22, updatedAt: t(14), enabled: true,
    fields: fields([
      ["mawb_no", "Số MAWB", "code", true, "MAWB|Master Air Waybill No.", "Số vận đơn chủ"],
      ["hawb_no", "Số HAWB", "code", false, "HAWB|House Air Waybill No.", "Số vận đơn"],
      ["flight", "Chuyến bay", "string", true, "Flight/Date|Flight No.", "Tên phương tiện vận chuyển"],
      ["airport_departure", "Sân bay đi", "code", true, "Airport of Departure", "Địa điểm xếp hàng"],
      ["airport_destination", "Sân bay đến", "code", true, "Airport of Destination", "Địa điểm dỡ hàng"],
      ["pieces", "Số kiện", "decimal", true, "No. of Pieces|RCP|Pcs", "Số lượng kiện"],
      ["chargeable_weight", "Trọng lượng tính cước", "decimal", false, "Chargeable Weight|Chg. Wt."],
    ]),
  },
  {
    id: "sk_co_ak", code: "SK-CO-AK", name: "C/O form AK (ASEAN – Hàn Quốc)", kind: "DOCUMENT", docKind: "CERT_OF_ORIGIN",
    language: "Tiếng Anh", version: 2, accuracy: 0.913, labeledSamples: 14, updatedAt: t(21), enabled: true,
    fields: fields([
      ["co_no", "Số C/O", "code", true, "Reference No.|Certificate No.", "Số C/O ưu đãi"],
      ["co_date", "Ngày cấp", "date", true, "Date of Issue|Issued on", "Ngày cấp C/O"],
      ["form", "Mẫu C/O", "code", true, "Form AK|FORM AK", "Mã biểu thuế ưu đãi"],
      ["origin_criterion", "Tiêu chí xuất xứ", "code", true, "Origin Criterion|RVC|CTH|WO"],
      ["invoice_ref", "Số + ngày invoice tham chiếu", "code", true, "Number and date of invoices"],
      ["hs_codes", "Mã HS trên C/O", "code", false, "HS Code|H.S. Code"],
    ]),
  },
  {
    id: "sk_co_e", code: "SK-CO-E", name: "C/O form E (ASEAN – Trung Quốc)", kind: "DOCUMENT", docKind: "CERT_OF_ORIGIN",
    language: "Tiếng Anh", version: 1, labeledSamples: 4, updatedAt: t(30), enabled: false,
    fields: fields([
      ["co_no", "Số C/O", "code", true, "Reference No.|Certificate No.", "Số C/O ưu đãi"],
      ["co_date", "Ngày cấp", "date", true, "Date of Issue", "Ngày cấp C/O"],
      ["origin_criterion", "Tiêu chí xuất xứ", "code", true, "Origin Criterion"],
      ["invoice_ref", "Số + ngày invoice tham chiếu", "code", true, "Number and date of invoices"],
    ]),
  },
  {
    id: "sk_an_gen", code: "SK-AN-GEN", name: "Arrival Notice (giấy báo hàng đến)", kind: "DOCUMENT", docKind: "ARRIVAL_NOTICE",
    language: "Tiếng Việt / Tiếng Anh", version: 2, accuracy: 0.927, labeledSamples: 17, updatedAt: t(11), enabled: true,
    fields: fields([
      ["hbl_no", "Số HBL", "code", true, "HB/L No.|House B/L|Số vận đơn", "Số vận đơn"],
      ["eta", "Ngày tàu đến (ETA)", "date", true, "ETA|Arrival Date|Ngày đến", "Ngày hàng đến"],
      ["freight", "Cước vận chuyển (O/F)", "decimal", true, "Ocean Freight|O/F|Cước biển", "Phí vận chuyển"],
      ["warehouse", "Kho / bãi", "string", false, "Warehouse|CFS|Kho hàng", "Địa điểm lưu kho"],
      ["local_charges", "Phí địa phương", "decimal", false, "THC|D/O Fee|CFS Fee|Handling", undefined, true, false],
    ]),
  },
  {
    id: "sk_frt_vat", code: "SK-FRT-VAT", name: "Hóa đơn GTGT cước vận chuyển", kind: "DOCUMENT", docKind: "FREIGHT_INVOICE",
    language: "Tiếng Việt", version: 2, accuracy: 0.985, labeledSamples: 19, updatedAt: t(5), enabled: true,
    fields: fields([
      ["einvoice_no", "Số hóa đơn", "code", true, "Số hóa đơn|Số|No.", "Số chứng từ cước"],
      ["einvoice_symbol", "Ký hiệu", "code", true, "Ký hiệu|Serial"],
      ["seller_tax_code", "MST đơn vị bán", "code", true, "Mã số thuế|MST"],
      ["freight_amount", "Cước quốc tế (ngoại tệ)", "decimal", true, "Cước vận chuyển quốc tế|Ocean freight|Air freight", "Phí vận chuyển"],
      ["exchange_rate", "Tỷ giá trên hóa đơn", "decimal", false, "Tỷ giá|Exchange rate", undefined, true, false],
      ["total_vnd", "Tổng tiền thanh toán (VND)", "decimal", false, "Tổng cộng tiền thanh toán"],
    ]),
  },
  {
    id: "sk_inv_hansol", code: "SK-INV-HANSOL", name: "Invoice – HANSOL PRECISION", kind: "SUPPLIER", docKind: "INVOICE",
    supplier: "HANSOL PRECISION CO., LTD.", language: "Tiếng Anh (Hàn Quốc)", version: 3, accuracy: 0.991, labeledSamples: 12, updatedAt: t(2), enabled: true,
    fields: fields([
      ...INVOICE_FIELDS.slice(0, 8),
      ["model_no", "Mã model (dòng hàng)", "code", true, "MODEL|Part No.|P/N"],
      ["items", "Danh sách hàng hóa", "items", true, "DESCRIPTION|Commodity", "Danh sách hàng"],
    ]),
  },
  {
    id: "sk_inv_artemide", code: "SK-INV-ARTEMIDE", name: "Invoice – ARTEMIDE (Ý, số kiểu EU)", kind: "SUPPLIER", docKind: "INVOICE",
    supplier: "ARTEMIDE INDUSTRIALE S.P.A.", language: "Tiếng Ý / Tiếng Anh · số kiểu EU (1.234,56)", version: 2, accuracy: 0.957, labeledSamples: 8, updatedAt: t(16), enabled: true,
    fields: fields([
      ["invoice_no", "Số hóa đơn", "code", true, "Fattura N.|Invoice No.|N. documento", "Số hóa đơn thương mại"],
      ["invoice_date", "Ngày hóa đơn", "date", true, "Data|Date|Data documento", "Ngày phát hành hóa đơn"],
      ["buyer", "Người mua", "party", true, "Destinatario|Cliente|Consignee", "Người nhập khẩu"],
      ["incoterm", "Điều kiện giao hàng", "code", true, "Resa|Porto|Incoterms", "Điều kiện giá hóa đơn"],
      ["total_amount", "Tổng trị giá", "decimal", true, "Totale documento|Totale fattura|Total EUR", "Tổng trị giá hóa đơn"],
      ["rex_no", "Số REX (tự chứng nhận xuất xứ)", "code", true, "REX|IT REX|Registered Exporter", "Số văn bản chứng nhận xuất xứ"],
      ["origin_statement", "Lời văn tự chứng nhận EVFTA", "string", true, "The exporter of the products covered by this document"],
      ["items", "Danh sách hàng hóa", "items", true, "Descrizione|Articolo|Description", "Danh sách hàng"],
    ]),
  },
  {
    id: "sk_map_ida", code: "SK-MAP-IDA", name: "Ánh xạ tờ khai nhập khẩu (IDA)", kind: "MAPPING",
    language: "Quy tắc (không dùng AI)", version: 9, labeledSamples: 0, updatedAt: t(4), enabled: true,
    fields: fields([
      ["NNK", "Người nhập khẩu", "party", true, "", "MST doanh nghiệp (Tài khoản) – không lấy tên tiếng Anh trên invoice"],
      ["NXK", "Người xuất khẩu", "party", true, "", "Invoice › Người bán"],
      ["SHDV", "Số vận đơn", "code", true, "", "B/L › Số vận đơn (lô hàng không: AWB › Số HAWB, không có thì MAWB)"],
      ["SLKH", "Số lượng kiện", "decimal", true, "", "Packing List › Số kiện; thiếu PL → B/L › Số kiện"],
      ["TTLH", "Tổng trọng lượng hàng (Gross)", "decimal", true, "", "Packing List › GW; đối chiếu B/L › GW"],
      ["DDDH", "Địa điểm dỡ hàng", "code", true, "", "B/L › POD; nếu là cảng chuyển tải nước ngoài → điểm đến cuối tại VN"],
      ["DDXH", "Địa điểm xếp hàng", "code", true, "", "B/L › POL"],
      ["PTVC", "Phương tiện vận chuyển", "string", true, "", "B/L › Tên tàu / chuyến"],
      ["DKGHD", "Điều kiện giá hóa đơn", "code", true, "", "Invoice › Incoterm"],
      ["TGHD", "Tổng trị giá hóa đơn", "decimal", true, "", "Invoice › Tổng trị giá"],
      ["PVC", "Phí vận chuyển", "decimal", false, "", "Bắt buộc khi EXW/FCA/FAS/FOB: Hóa đơn cước › Cước quốc tế, không có → Arrival Notice › O/F"],
      ["TGTT", "Tỷ giá tính thuế", "decimal", true, "", "Hệ thống – tỷ giá HQ theo ngày đăng ký tờ khai"],
      ["MBTUD", "Mã biểu thuế ưu đãi", "code", false, "", "C/O › Mẫu (AK → B07…); REX hợp lệ → EVFTA"],
      ["MLH", "Mã loại hình", "code", true, "", "Hồ sơ › Mã loại hình"],
      ["CQHQ", "Cơ quan Hải quan", "code", true, "", "Hồ sơ › Cơ quan Hải quan"],
    ]),
  },
  {
    id: "sk_map_eda", code: "SK-MAP-EDA", name: "Ánh xạ tờ khai xuất khẩu (EDA)", kind: "MAPPING",
    language: "Quy tắc (không dùng AI)", version: 4, labeledSamples: 0, updatedAt: t(20), enabled: true,
    fields: fields([
      ["NXK", "Người xuất khẩu", "party", true, "", "MST doanh nghiệp (Tài khoản)"],
      ["NNK", "Người nhập khẩu", "party", true, "", "Invoice › Người mua"],
      ["SHDV", "Số vận đơn / booking", "code", false, "", "B/L › Số vận đơn (có thể bổ sung sau)"],
      ["SLKH", "Số lượng kiện", "decimal", true, "", "Packing List › Số kiện"],
      ["TTLH", "Tổng trọng lượng hàng (Gross)", "decimal", true, "", "Packing List › GW"],
      ["DDXH", "Địa điểm xếp hàng", "code", true, "", "Hồ sơ › Cảng xuất (mặc định VNHPH)"],
      ["DKGHD", "Điều kiện giá hóa đơn", "code", true, "", "Invoice › Incoterm"],
      ["TGHD", "Tổng trị giá hóa đơn", "decimal", true, "", "Invoice › Tổng trị giá"],
      ["MLH", "Mã loại hình", "code", true, "", "Hồ sơ › Mã loại hình (B11 mặc định)"],
    ]),
  },
];

/** Skill mẫu của hệ thống – GIỐNG dữ liệu mock FE (apps/web/src/mocks/seed/skills.ts) để demo liền mạch. */
export function skillTemplates(): { skills: Skill[] } {
  return { skills: SKILLS };
}
