// Bảng đặc tả: mỗi trường của Shipment lấy từ chứng từ nào, chuẩn hóa ra sao, hiện trên màn OCR với key/nhãn/nhóm nào.
// Dùng chung cho merge (gộp) và projectFields (chiếu ra extracted_fields) để hai bên không lệch.
import type { DocKind, FieldGroup } from "@kb/contracts";
import { countryCode, normalizeTaxCode, packageUnitCode, parseDate, parseNumber, unitCode } from "./normalize.js";

export type Normalizer = (raw: unknown) => string | null;
/** `rawPath`: đường dẫn trong dữ liệu model ("invoiceNo", "seller.name") – để ghi ngược giá trị người dùng sửa vào bản đọc (mẫu tự học). */
export type Getter = ((data: Record<string, unknown>) => unknown) & { rawPath?: string };

export type FieldSpec = {
  /** Đường dẫn JSON trong Shipment (vd /invoice/no). */
  path: string;
  key: string;
  label: string;
  group: FieldGroup;
  normalize: Normalizer;
  /**
   * Nguồn theo thứ tự ưu tiên; getter đọc từ dữ liệu model của loại chứng từ đó.
   * `fallback`: chứng từ chỉ ghi chung chung cho trường này (C/O ghi "HO CHI MINH, VIET NAM" khi B/L ghi "CAT LAI") –
   * chỉ dùng khi mọi nguồn chính trống, không so lệch với nguồn chính (tránh báo CONFLICT giả).
   */
  sources: { kind: DocKind; get: Getter; regionKey?: string; fallback?: true }[];
  /** Kiểm tra định dạng sau chuẩn hóa (mặc định: có giá trị). */
  valid?: (normalized: string) => boolean;
};

const str: Normalizer = (v) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const upper: Normalizer = (v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);
/** Số vận đơn/AWB: nhãn chuyển phát in cách nhóm ("7704 7118 4612") – bỏ khoảng trắng, giữ gạch ("618-44021375"). */
const ident: Normalizer = (v) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, "").toUpperCase() : typeof v === "number" ? String(v) : null);
const num: Normalizer = (v) => parseNumber(v as string | number | null);
const date: Normalizer = (v) => parseDate(v as string | null);
const country: Normalizer = (v) => countryCode(v as string | null);
const unit: Normalizer = (v) => unitCode(v as string | null) ?? upper(v);
const pkgUnit: Normalizer = (v) => packageUnitCode(v as string | null) ?? upper(v);
const tax: Normalizer = (v) => normalizeTaxCode(v as string | null);
const at = (rawPath: string, get: (d: Record<string, unknown>) => unknown): Getter => Object.assign(get, { rawPath });
const party = (p: string) => at(`${p}.name`, (d) => (d[p] as Record<string, unknown> | null)?.["name"]);
const partyField = (p: string, f: string) => at(`${p}.${f}`, (d) => (d[p] as Record<string, unknown> | null)?.[f]);
const g = (k: string): Getter => at(k, (d) => d[k]);

export const SHIPMENT_FIELDS: FieldSpec[] = [
  { path: "/invoice/no", key: "invoice_no", label: "Số hóa đơn", group: "GENERAL", normalize: str, sources: [{ kind: "INVOICE", get: g("invoiceNo"), regionKey: "invoiceNo" }, { kind: "PACKING_LIST", get: g("invoiceNo"), regionKey: "invoiceNo" }, { kind: "CERT_OF_ORIGIN", get: g("invoiceNo"), regionKey: "invoiceNo" }] },
  { path: "/invoice/date", key: "invoice_date", label: "Ngày hóa đơn", group: "GENERAL", normalize: date, sources: [{ kind: "INVOICE", get: g("invoiceDate"), regionKey: "invoiceDate" }, { kind: "CERT_OF_ORIGIN", get: g("invoiceDate"), regionKey: "invoiceDate" }] },
  { path: "/invoice/poNo", key: "po_no", label: "Số PO", group: "GENERAL", normalize: str, sources: [{ kind: "INVOICE", get: g("poNo"), regionKey: "poNo" }] },
  { path: "/invoice/incotermPlace", key: "incoterm_place", label: "Địa điểm giao hàng", group: "COMMERCIAL", normalize: str, sources: [{ kind: "INVOICE", get: g("incotermPlace"), regionKey: "incotermPlace" }] },
  { path: "/invoice/incoterm", key: "incoterm", label: "Điều kiện giao hàng", group: "COMMERCIAL", normalize: upper, sources: [{ kind: "INVOICE", get: g("incoterm"), regionKey: "incoterm" }, { kind: "SALES_CONTRACT", get: g("incoterm"), regionKey: "incoterm" }], valid: (v) => /^(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/.test(v) },
  { path: "/invoice/currency", key: "currency", label: "Mã tiền tệ", group: "COMMERCIAL", normalize: upper, sources: [{ kind: "INVOICE", get: g("currency"), regionKey: "currency" }, { kind: "SALES_CONTRACT", get: g("currency"), regionKey: "currency" }], valid: (v) => /^[A-Z]{3}$/.test(v) },
  { path: "/invoice/totalAmount", key: "total_amount", label: "Tổng trị giá", group: "COMMERCIAL", normalize: num, sources: [{ kind: "INVOICE", get: g("totalAmount"), regionKey: "totalAmount" }] },
  { path: "/invoice/paymentTerms", key: "payment_terms", label: "Phương thức thanh toán", group: "COMMERCIAL", normalize: str, sources: [{ kind: "INVOICE", get: g("paymentTerms"), regionKey: "paymentTerms" }, { kind: "SALES_CONTRACT", get: g("paymentTerms"), regionKey: "paymentTerms" }] },
  { path: "/parties/seller/name", key: "seller_name", label: "Người bán", group: "PARTIES", normalize: str, sources: [{ kind: "INVOICE", get: party("seller"), regionKey: "seller" }, { kind: "BILL_OF_LADING", get: party("shipper"), regionKey: "shipper" }, { kind: "AIR_WAYBILL", get: party("shipper"), regionKey: "shipper" }, { kind: "CERT_OF_ORIGIN", get: party("exporter"), regionKey: "exporter" }, { kind: "SALES_CONTRACT", get: party("seller"), regionKey: "seller" }] },
  { path: "/parties/seller/address", key: "seller_address", label: "Địa chỉ người bán", group: "PARTIES", normalize: str, sources: [{ kind: "INVOICE", get: partyField("seller", "address") }, { kind: "SALES_CONTRACT", get: partyField("seller", "address") }] },
  { path: "/parties/seller/country", key: "seller_country", label: "Nước người bán", group: "PARTIES", normalize: country, sources: [{ kind: "INVOICE", get: partyField("seller", "country") }, { kind: "BILL_OF_LADING", get: partyField("shipper", "country") }, { kind: "CERT_OF_ORIGIN", get: partyField("exporter", "country") }] },
  { path: "/parties/buyer/name", key: "buyer_name", label: "Người mua", group: "PARTIES", normalize: str, sources: [{ kind: "INVOICE", get: party("buyer"), regionKey: "buyer" }, { kind: "BILL_OF_LADING", get: party("consignee"), regionKey: "consignee" }, { kind: "AIR_WAYBILL", get: party("consignee"), regionKey: "consignee" }, { kind: "SALES_CONTRACT", get: party("buyer"), regionKey: "buyer" }] },
  { path: "/parties/buyer/address", key: "buyer_address", label: "Địa chỉ người mua", group: "PARTIES", normalize: str, sources: [{ kind: "INVOICE", get: partyField("buyer", "address") }] },
  { path: "/parties/buyer/taxCode", key: "buyer_tax_code", label: "MST người mua", group: "PARTIES", normalize: tax, sources: [{ kind: "INVOICE", get: partyField("buyer", "taxCode") }, { kind: "SALES_CONTRACT", get: partyField("buyer", "taxCode") }], valid: (v) => /^\d{10}(\d{3})?$/.test(v) },
  { path: "/parties/buyer/country", key: "buyer_country", label: "Nước người mua", group: "PARTIES", normalize: country, sources: [{ kind: "INVOICE", get: partyField("buyer", "country") }] },
  { path: "/transport/billNo", key: "bill_no", label: "Số vận đơn", group: "TRANSPORT", normalize: ident, sources: [{ kind: "BILL_OF_LADING", get: g("billNo"), regionKey: "billNo" }, { kind: "AIR_WAYBILL", get: g("awbNo"), regionKey: "awbNo" }, { kind: "ARRIVAL_NOTICE", get: g("billNo"), regionKey: "billNo" }, { kind: "FREIGHT_INVOICE", get: g("billRef"), regionKey: "billRef" }] },
  { path: "/transport/masterBillNo", key: "master_bill_no", label: "Số vận đơn chủ (MB/L, MAWB)", group: "TRANSPORT", normalize: ident, sources: [{ kind: "BILL_OF_LADING", get: g("masterBillNo") }, { kind: "AIR_WAYBILL", get: g("awbNo"), regionKey: "awbNo" }, { kind: "ARRIVAL_NOTICE", get: g("masterBillNo"), regionKey: "masterBillNo" }] },
  { path: "/transport/houseBillNo", key: "house_bill_no", label: "Số vận đơn nhà (HB/L, HAWB)", group: "TRANSPORT", normalize: ident, sources: [{ kind: "BILL_OF_LADING", get: g("billNo"), regionKey: "billNo" }, { kind: "AIR_WAYBILL", get: g("hawbNo"), regionKey: "hawbNo" }, { kind: "ARRIVAL_NOTICE", get: g("billNo"), regionKey: "billNo" }] },
  { path: "/transport/flightNo", key: "flight_no", label: "Chuyến bay", group: "TRANSPORT", normalize: upper, sources: [{ kind: "AIR_WAYBILL", get: g("flight"), regionKey: "flight" }, { kind: "ARRIVAL_NOTICE", get: g("flightNo"), regionKey: "flightNo" }] },
  { path: "/transport/departureDate", key: "departure_date", label: "Ngày hàng đi", group: "TRANSPORT", normalize: date, sources: [{ kind: "BILL_OF_LADING", get: (d) => d["dateOfIssue"] ?? d["date"], regionKey: "date" }, { kind: "AIR_WAYBILL", get: g("flightDate"), regionKey: "flightDate" }, { kind: "CERT_OF_ORIGIN", get: g("departureDate"), regionKey: "departureDate" }] },
  { path: "/transport/placeOfIssue", key: "place_of_issue", label: "Nơi phát hành vận đơn", group: "TRANSPORT", normalize: str, sources: [{ kind: "BILL_OF_LADING", get: g("placeOfIssue") }, { kind: "AIR_WAYBILL", get: g("placeOfIssue") }] },
  { path: "/transport/warehouseCode", key: "warehouse_code", label: "Mã kho / CY", group: "TRANSPORT", normalize: upper, sources: [{ kind: "ARRIVAL_NOTICE", get: g("warehouseCode"), regionKey: "warehouseCode" }] },
  { path: "/transport/warehouseName", key: "warehouse_name", label: "Kho / CY", group: "TRANSPORT", normalize: str, sources: [{ kind: "ARRIVAL_NOTICE", get: g("warehouseName"), regionKey: "warehouseName" }] },
  { path: "/transport/vessel", key: "vessel", label: "Tàu / chuyến bay", group: "TRANSPORT", normalize: str, sources: [{ kind: "BILL_OF_LADING", get: g("vessel"), regionKey: "vessel" }, { kind: "AIR_WAYBILL", get: g("flight"), regionKey: "flight" }, { kind: "ARRIVAL_NOTICE", get: g("vessel"), regionKey: "vessel" }] },
  { path: "/transport/freightTerm", key: "freight_term", label: "Điều kiện cước (Prepaid / Collect)", group: "TRANSPORT", normalize: upper, valid: (v) => v === "PREPAID" || v === "COLLECT", sources: [{ kind: "BILL_OF_LADING", get: g("freightTerm"), regionKey: "freightTerm" }] },
  { path: "/transport/voyage", key: "voyage", label: "Số chuyến", group: "TRANSPORT", normalize: str, sources: [{ kind: "BILL_OF_LADING", get: g("voyage") }] },
  { path: "/transport/portOfLoading", key: "port_loading", label: "Cảng xếp hàng", group: "TRANSPORT", normalize: str, sources: [{ kind: "BILL_OF_LADING", get: g("portOfLoading"), regionKey: "portOfLoading" }, { kind: "AIR_WAYBILL", get: g("airportOfDeparture"), regionKey: "airportOfDeparture" }, { kind: "ARRIVAL_NOTICE", get: g("portOfLoading"), regionKey: "portOfLoading" }, { kind: "CERT_OF_ORIGIN", get: g("portOfLoading"), regionKey: "portOfLoading", fallback: true }] },
  { path: "/transport/portOfDischarge", key: "port_discharge", label: "Cảng dỡ hàng", group: "TRANSPORT", normalize: str, sources: [{ kind: "BILL_OF_LADING", get: g("portOfDischarge"), regionKey: "portOfDischarge" }, { kind: "AIR_WAYBILL", get: g("airportOfDestination"), regionKey: "airportOfDestination" }, { kind: "ARRIVAL_NOTICE", get: g("portOfDischarge"), regionKey: "portOfDischarge" }, { kind: "CERT_OF_ORIGIN", get: g("portOfDischarge"), regionKey: "portOfDischarge", fallback: true }] },
  { path: "/transport/finalDestination", key: "final_destination", label: "Điểm đến cuối", group: "TRANSPORT", normalize: str, sources: [{ kind: "BILL_OF_LADING", get: g("placeOfDelivery") }, { kind: "ARRIVAL_NOTICE", get: g("finalDestination") }] },
  // Không có Arrival Notice (hàng air/chuyển phát): hóa đơn/thông báo cước thường phát hành ngày hàng về – dự phòng, tờ khai đánh dấu cần kiểm.
  { path: "/transport/arrivalDate", key: "arrival_date", label: "Ngày hàng đến", group: "TRANSPORT", normalize: date, sources: [{ kind: "ARRIVAL_NOTICE", get: g("eta"), regionKey: "eta" }, { kind: "FREIGHT_INVOICE", get: g("date"), regionKey: "date", fallback: true }] },
  { path: "/transport/packages", key: "packages", label: "Số kiện", group: "TRANSPORT", normalize: num, sources: [{ kind: "PACKING_LIST", get: g("packages"), regionKey: "packages" }, { kind: "BILL_OF_LADING", get: g("packages"), regionKey: "packages" }, { kind: "AIR_WAYBILL", get: g("pieces"), regionKey: "pieces" }, { kind: "ARRIVAL_NOTICE", get: g("packages"), regionKey: "packages" }, { kind: "INVOICE", get: g("packages"), regionKey: "packages" }] },
  { path: "/transport/packageUnit", key: "package_unit", label: "Loại kiện", group: "TRANSPORT", normalize: pkgUnit, sources: [{ kind: "PACKING_LIST", get: g("packageUnit") }, { kind: "BILL_OF_LADING", get: g("packageUnit") }, { kind: "ARRIVAL_NOTICE", get: g("packageUnit") }] },
  { path: "/transport/grossWeightKg", key: "gross_weight", label: "Trọng lượng cả bì (kg)", group: "TRANSPORT", normalize: num, sources: [{ kind: "PACKING_LIST", get: g("grossWeightKg"), regionKey: "grossWeightKg" }, { kind: "BILL_OF_LADING", get: g("grossWeightKg"), regionKey: "grossWeightKg" }, { kind: "AIR_WAYBILL", get: g("grossWeightKg"), regionKey: "grossWeightKg" }, { kind: "ARRIVAL_NOTICE", get: g("grossWeightKg"), regionKey: "grossWeightKg" }, { kind: "INVOICE", get: g("grossWeightKg"), regionKey: "grossWeightKg" }] },
  { path: "/transport/netWeightKg", key: "net_weight", label: "Trọng lượng tịnh (kg)", group: "TRANSPORT", normalize: num, sources: [{ kind: "PACKING_LIST", get: g("netWeightKg"), regionKey: "netWeightKg" }] },
  { path: "/origin/country", key: "origin_country", label: "Nước xuất xứ", group: "COMMERCIAL", normalize: country, sources: [{ kind: "CERT_OF_ORIGIN", get: g("originCountry"), regionKey: "originCountry" }] },
  { path: "/origin/coForm", key: "co_form", label: "Mẫu C/O", group: "COMMERCIAL", normalize: upper, sources: [{ kind: "CERT_OF_ORIGIN", get: g("form"), regionKey: "form" }] },
  { path: "/origin/coNo", key: "co_no", label: "Số C/O", group: "COMMERCIAL", normalize: str, sources: [{ kind: "CERT_OF_ORIGIN", get: g("coNo"), regionKey: "coNo" }] },
  { path: "/origin/rexNo", key: "rex_no", label: "Số REX", group: "COMMERCIAL", normalize: str, sources: [{ kind: "CERT_OF_ORIGIN", get: g("rexNo") }] },
  { path: "/origin/coDate", key: "co_date", label: "Ngày cấp C/O", group: "COMMERCIAL", normalize: date, sources: [{ kind: "CERT_OF_ORIGIN", get: g("issueDate"), regionKey: "issueDate" }] },
  { path: "/origin/coInvoiceNo", key: "co_invoice_no", label: "Số invoice trên C/O", group: "COMMERCIAL", normalize: str, sources: [{ kind: "CERT_OF_ORIGIN", get: g("invoiceNo") }] },
];

export const ITEM_SPECS: { field: "description" | "quantity" | "unit" | "unitPrice" | "amount" | "origin" | "hsOnInvoice" | "partNo"; key: string; label: string; normalize: Normalizer; get: (item: Record<string, unknown>) => unknown; raw?: string }[] = [
  { field: "description", key: "description", label: "Mô tả", normalize: str, get: (i) => i["description"] },
  { field: "quantity", key: "quantity", label: "Số lượng", normalize: num, get: (i) => i["quantity"] },
  { field: "unit", key: "unit", label: "Đơn vị", normalize: unit, get: (i) => i["unit"] },
  { field: "unitPrice", key: "unit_price", label: "Đơn giá", normalize: num, get: (i) => i["unitPrice"] },
  { field: "amount", key: "amount", label: "Thành tiền", normalize: num, get: (i) => i["amount"] },
  { field: "origin", key: "origin", label: "Xuất xứ", normalize: country, get: (i) => i["origin"] },
  { field: "hsOnInvoice", key: "hs_on_invoice", label: "HS trên invoice", normalize: str, get: (i) => i["hsCodeOnInvoice"], raw: "hsCodeOnInvoice" },
  { field: "partNo", key: "part_no", label: "Mã hàng (Part No)", normalize: str, get: (i) => i["partNo"] },
];
