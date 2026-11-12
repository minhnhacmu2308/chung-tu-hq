// kb-allow-raw: nhãn in trên chứng từ thương mại (Commercial Invoice / Packing List) theo thông lệ L/C – UCP600 / ISBP 821,
// luôn tiếng Anh bất kể ngôn ngữ giao diện (thuộc mục "Không dịch – tên chứng từ in trên bản gốc" của .claude/rules/ho-tro-3-ngon-ngu.md).
export const DOC_LABELS = {
  invoiceTitle: "COMMERCIAL INVOICE", // kb-allow-raw: tên chứng từ in
  packingTitle: "PACKING LIST", // kb-allow-raw: tên chứng từ in
  original: "ORIGINAL", // kb-allow-raw: nhãn bản gốc (UCP600 17)
  copy: "COPY", // kb-allow-raw: nhãn bản sao (UCP600 17)
  void: "VOID", // kb-allow-raw: chữ chìm bản đã hủy
  taxCode: "Tax code", // kb-allow-raw
  tel: "Tel", // kb-allow-raw
  invoiceNo: "Invoice No.", // kb-allow-raw
  refInvoiceNo: "Ref. Invoice No.", // kb-allow-raw
  date: "Date", // kb-allow-raw
  lcNo: "L/C No.", // kb-allow-raw
  lcDate: "L/C date", // kb-allow-raw
  issuingBank: "Issuing bank", // kb-allow-raw
  poNo: "PO No.", // kb-allow-raw
  contractNo: "Contract No.", // kb-allow-raw
  blNo: "B/L No.", // kb-allow-raw
  blDate: "B/L date", // kb-allow-raw
  declarationNo: "Customs declaration No.", // kb-allow-raw
  country: "Country", // kb-allow-raw
  soldTo: "Applicant / Sold to", // kb-allow-raw
  buyer: "Buyer / Consignee", // kb-allow-raw
  shipment: "Shipment", // kb-allow-raw
  portOfLoading: "Port of loading", // kb-allow-raw
  portOfDischarge: "Port of discharge", // kb-allow-raw
  finalDestination: "Final destination", // kb-allow-raw
  vessel: "Vessel / Voyage", // kb-allow-raw
  departure: "On or about", // kb-allow-raw
  terms: "Terms of delivery", // kb-allow-raw
  payment: "Payment", // kb-allow-raw
  origin: "Country of origin", // kb-allow-raw
  no: "No.", // kb-allow-raw
  marks: "Marks & Nos.", // kb-allow-raw
  description: "Description of goods", // kb-allow-raw
  hs: "HS code", // kb-allow-raw
  quantity: "Quantity", // kb-allow-raw
  unit: "Unit", // kb-allow-raw
  unitPrice: "Unit price ({cur})", // kb-allow-raw
  amount: "Amount ({cur})", // kb-allow-raw
  total: "TOTAL", // kb-allow-raw
  packing: "Packing", // kb-allow-raw
  packages: "Total packages", // kb-allow-raw
  gross: "Gross weight", // kb-allow-raw
  net: "Net weight", // kb-allow-raw
  containers: "Container / Seal", // kb-allow-raw
  forAndOnBehalf: "For and on behalf of {seller}", // kb-allow-raw
  authorized: "Authorized signature", // kb-allow-raw
  incoterms: "INCOTERMS®", // kb-allow-raw
} as const;

/** Tiêu đề mặc định của từng nhóm thông tin (mẫu doanh nghiệp đổi được qua `label`). kb-allow-raw: nhãn in trên chứng từ, luôn tiếng Anh. */
export const BLOCK_LABELS = {
  SELLER: "Seller / Beneficiary", // kb-allow-raw
  BUYER: "Buyer / Applicant", // kb-allow-raw
  INVOICE_INFO: "Invoice", // kb-allow-raw
  LC_REF: "Letter of credit", // kb-allow-raw
  SHIPMENT: "Shipment", // kb-allow-raw
  TERMS: "Terms", // kb-allow-raw
  DECLARATION: "Customs", // kb-allow-raw
  MARKS: "Shipping marks", // kb-allow-raw
  ITEMS: "Description of goods", // kb-allow-raw
  TOTALS: "Total", // kb-allow-raw
  PACKING: "Packing", // kb-allow-raw
  ORIGIN: "Origin", // kb-allow-raw
  STATEMENT: "Declaration", // kb-allow-raw
  SIGNATURE: "Signature", // kb-allow-raw
} as const;

/** Tiêu đề cột bảng hàng mặc định. kb-allow-raw: nhãn in trên chứng từ, luôn tiếng Anh. */
export const COLUMN_LABELS = {
  LINE_NO: "No.", // kb-allow-raw
  DESCRIPTION: "Description of goods", // kb-allow-raw
  PART_NO: "Part No.", // kb-allow-raw
  HS_CODE: "HS code", // kb-allow-raw
  ORIGIN: "Origin", // kb-allow-raw
  QUANTITY: "Quantity", // kb-allow-raw
  UNIT: "Unit", // kb-allow-raw
  UNIT_PRICE: "Unit price ({cur})", // kb-allow-raw
  AMOUNT: "Amount ({cur})", // kb-allow-raw
} as const;
