// Danh mục trường chuẩn theo loại chứng từ = "chuẩn đọc" chung cho mọi khách hàng.
// Thứ tự và key phải khớp schema trích xuất (test catalog.test.ts). Nhãn theo bảng đọc chứng từ của người khai (Excel mẫu lô FANS25040166, YZS24120950).
import type { DocKind } from "../common.js";
import type { DocCatalog, DocFieldDef, DocFieldType } from "./types.js";

const f = (key: string, label: string, type: DocFieldType, aliases: string[] = [], since: 1 | 2 = 1): DocFieldDef => ({ key, label, type, aliases, since });

const INVOICE: DocCatalog = {
  kind: "INVOICE",
  fields: [
    f("invoiceNo", "Số hóa đơn", "code", ["Inv. No", "Invoice No", "Invoice Number", "PI No", "Proforma Invoice No"]),
    f("invoiceDate", "Ngày hóa đơn", "date", ["Date", "Invoice Date", "Inv. Date"]),
    f("seller", "Người xuất khẩu", "party", ["Người xuất khẩu/ địa chỉ", "Seller", "Shipper", "Exporter", "Beneficiary"]),
    f("buyer", "Người nhập khẩu", "party", ["Buyer", "Consignee", "Sold to", "Messrs", "Bill to"]),
    f("incoterm", "Điều kiện giao hàng", "code", ["Price basis", "Shipment Terms", "Terms of Delivery", "Price Terms", "Trade Terms"]),
    f("currency", "Mã tiền tệ", "code", ["Currency"]),
    f("totalAmount", "Tổng trị giá", "number", ["Total Amount", "Grand Total", "Total"]),
    f("paymentTerms", "Phương thức thanh toán", "text", ["Payment Terms", "Payment", "Terms of Payment"]),
    f("poNo", "Số đơn đặt hàng", "code", ["P/O No", "PO No", "Order No", "Your Ref"]),
    f("grossWeightKg", "Tổng trọng lượng (kg)", "number", ["Gross Weight", "G.W"]),
    f("packages", "Số kiện", "number", ["Packages", "Cartons", "Pallets"]),
    f("incotermPlace", "Địa điểm giao hàng", "text", ["Price basis", "Shipment Terms"], 2),
    f("originStatement", "Xuất xứ ghi trên hóa đơn", "text", ["Made In", "Made In China", "Country of origin"], 2),
  ],
  items: {
    key: "items",
    label: "Dòng hàng",
    fields: [
      f("lineNo", "STT dòng", "number", ["No", "Item"]),
      f("description", "Mô tả hàng", "text", ["DESCRIPTION OF GOODS", "Product Description", "Commodity", "Description"]),
      f("hsCodeOnInvoice", "Mã HS trên hóa đơn", "code", ["HS Code", "H.S Code"]),
      f("quantity", "Số lượng", "number", ["QUANTITY", "Qty"]),
      f("unit", "Đơn vị tính", "code", ["Unit", "UOM"]),
      f("unitPrice", "Đơn giá", "number", ["UNIT PRICE", "Unit Price/(USD)", "Price"]),
      f("amount", "Thành tiền", "number", ["AMOUNT", "Total Amount", "Total"]),
      f("origin", "Xuất xứ", "code", ["Origin", "Country of Origin"]),
      f("partNo", "Mã hàng (Part No / Model)", "code", ["PART NO", "Part No", "Model", "Item Code", "Article No"], 2),
    ],
  },
};

const PACKING_LIST: DocCatalog = {
  kind: "PACKING_LIST",
  fields: [
    f("invoiceNo", "Số hóa đơn tham chiếu", "code", ["Invoice No", "Inv. No"]),
    f("date", "Ngày lập", "date", ["Date"]),
    f("packages", "Tổng số kiện", "number", ["Total Packages", "Total Cartons", "Total Pallets", "Packages"]),
    f("packageUnit", "Loại kiện", "code", ["Package Unit", "Kind of packages"]),
    f("grossWeightKg", "Tổng trọng lượng cả bì (kg)", "number", ["Gross Weight", "G.W", "Total G.W"]),
    f("netWeightKg", "Tổng trọng lượng tịnh (kg)", "number", ["Net Weight", "N.W", "Total N.W"]),
    f("volumeCbm", "Tổng thể tích (CBM)", "number", ["Measurement", "Volume", "CBM", "M3"]),
    f("marks", "Ký mã hiệu", "text", ["Marks & Nos", "Shipping Marks", "Marks"]),
  ],
  items: {
    key: "items",
    label: "Dòng hàng",
    fields: [
      f("lineNo", "STT dòng", "number", ["No", "Item"]),
      f("description", "Mô tả hàng", "text", ["Description", "Description of Goods"]),
      f("quantity", "Số lượng", "number", ["Quantity", "Qty"]),
      f("unit", "Đơn vị tính", "code", ["Unit"]),
      f("packages", "Số kiện của dòng", "number", ["Packages", "Cartons", "CTNS"]),
      f("netWeightKg", "Trọng lượng tịnh (kg)", "number", ["N.W", "Net Weight"]),
      f("grossWeightKg", "Trọng lượng cả bì (kg)", "number", ["G.W", "Gross Weight"]),
    ],
  },
};

const BILL_OF_LADING: DocCatalog = {
  kind: "BILL_OF_LADING",
  fields: [
    f("billNo", "Số vận đơn", "code", ["Bill No", "B/L No", "HBL No", "Bill of Lading No"]),
    f("masterBillNo", "Số vận đơn chủ (MB/L)", "code", ["MBL", "Master B/L", "MB/L"]),
    f("date", "Ngày vận đơn", "date", ["Date of issue", "Shipped on board date", "On board date"]),
    f("shipper", "Người gửi hàng", "party", ["Shipper"]),
    f("consignee", "Người nhận hàng", "party", ["Consignee"]),
    f("notifyParty", "Bên được thông báo", "party", ["Notify Party", "Notify"]),
    f("vessel", "Tên tàu", "text", ["Ocean Vessel", "Vessel", "Vessel/Voyage"]),
    f("voyage", "Số chuyến", "code", ["Voyage", "Voy. No"]),
    f("portOfLoading", "Cảng xếp hàng", "text", ["Port of loading", "POL"]),
    f("portOfDischarge", "Cảng dỡ hàng", "text", ["Port of discharge", "POD"]),
    f("placeOfDelivery", "Nơi giao hàng", "text", ["Place of Delivery", "Final Destination"]),
    f("packages", "Số kiện", "number", ["Number and kind of packages", "No. of packages", "Packages"]),
    f("packageUnit", "Loại kiện", "code", ["Kind of packages"]),
    f("grossWeightKg", "Trọng lượng cả bì (kg)", "number", ["Gross weight", "G.W"]),
    f("placeOfIssue", "Nơi phát hành", "text", ["Place and date of issue", "Place of issue"], 2),
    f("dateOfIssue", "Ngày phát hành", "date", ["Date of issue"], 2),
    f("freightTerm", "Điều kiện cước", "code", ["Freight Prepaid", "Freight Collect", "Freight payable at"]),
  ],
  items: {
    key: "containers",
    label: "Container",
    fields: [
      f("no", "Số container", "code", ["Container No", "Cont No"]),
      f("sealNo", "Số chì", "code", ["Seal No", "Seal"]),
      f("size", "Loại container", "code", ["Size", "Type", "Cont Type"]),
    ],
  },
};

const AIR_WAYBILL: DocCatalog = {
  kind: "AIR_WAYBILL",
  fields: [
    f("awbNo", "Số MAWB", "code", ["MAWB", "Master Air Waybill", "AWB No"]),
    f("hawbNo", "Số HAWB", "code", ["HAWB", "House Air Waybill"]),
    f("date", "Ngày HAWB", "date", ["Ngày HAWB", "Executed on (date)", "Date"]),
    f("shipper", "Người gửi hàng", "party", ["Shipper's Name and Address", "Shipper"]),
    f("consignee", "Người nhận hàng", "party", ["Consignee's Name and address", "Consignee"]),
    f("flight", "Chuyến bay", "code", ["Requested Flight", "Requesled Flight/Date", "Flight", "Flight/Date"]),
    f("airportOfDeparture", "Sân bay đi", "text", ["Airport of Departure", "Airport of Departure (Addr. of First Carrier)"]),
    f("airportOfDestination", "Sân bay đến", "text", ["Airport of Destination"]),
    f("pieces", "Số kiện", "number", ["No of Pieces RCP", "No. of Pieces", "Pieces"]),
    f("grossWeightKg", "Trọng lượng cả bì (kg)", "number", ["Gross Weight"]),
    f("chargeableWeightKg", "Trọng lượng tính cước (kg)", "number", ["Chargeable Weight"]),
    f("flightDate", "Ngày bay", "date", ["Flight Date", "Requested Flight/Date"], 2),
    f("placeOfIssue", "Nơi phát hành", "text", ["Executed at", "Place of issue"], 2),
  ],
};

const CERT_OF_ORIGIN: DocCatalog = {
  kind: "CERT_OF_ORIGIN",
  fields: [
    f("form", "Mẫu C/O", "code", ["Form", "Form E", "Form D", "Form AK"]),
    f("coNo", "Số C/O", "code", ["Reference No", "Reference No.", "Certificate No"]),
    f("issueDate", "Ngày cấp", "date", ["Date of issue", "Issued on"]),
    f("exporter", "Người xuất khẩu (ô 1)", "party", ["1. Products consigned from", "1.Products consigned from", "Exporter"]),
    f("consignee", "Người nhận hàng (ô 2)", "party", ["2. Products consigned to", "2.Products consigned to (Consignee's name,address,country)", "Consignee"]),
    f("invoiceNo", "Số hóa đơn (ô 10)", "code", ["10. Number, date of Invoices", "10.Number, date of Invoices", "Invoice No"]),
    f("invoiceDate", "Ngày hóa đơn (ô 10)", "date", ["Invoice date"]),
    f("originCountry", "Nước xuất xứ", "code", ["Country of origin", "Origin country"]),
    f("rexNo", "Số REX", "code", ["REX No", "Registered Exporter"]),
    f("departureDate", "Ngày khởi hành (ô 3)", "date", ["Departure date", "Departune date"], 2),
    f("transportName", "Tàu / chuyến bay (ô 3)", "text", ["Vessel's name/Aircraft etc", "3. Means of transport dan route", "3. Means of transport and route"], 2),
    f("portOfLoading", "Nơi đi (ô 3)", "text", ["From"], 2),
    f("portOfDischarge", "Cảng dỡ (ô 3)", "text", ["Port of Discharge", "To"], 2),
    f("packagesDescription", "Số và loại kiện, mô tả hàng (ô 7)", "text", ["7. Number and type of packages", "7.Number and type of packages, description of products"], 2),
    f("quantityOrWeight", "Trọng lượng / số lượng (ô 9)", "text", ["9. Gross weight or net weight...", "9.Gross weight", "9. Gross weight or other quantity"], 2),
    f("certified", "Có chữ ký và con dấu (ô 12)", "boolean", ["12. Certification", "12.Certification", "Certification"], 2),
  ],
  items: {
    key: "items",
    label: "Hàng trên C/O",
    fields: [
      f("description", "Mô tả hàng", "text", ["Description of products"]),
      f("hs6", "Mã HS (6 số)", "code", ["HS CODE", "HS Code", "H.S. Code"]),
      f("criterion", "Tiêu chí xuất xứ (ô 8)", "code", ["8. Origin criteria", "8.Origin", "Origin criterion"]),
    ],
  },
};

const SALES_CONTRACT: DocCatalog = {
  kind: "SALES_CONTRACT",
  fields: [
    f("contractNo", "Số hợp đồng", "code", ["Contract No", "S/C No"]),
    f("date", "Ngày ký", "date", ["Date"]),
    f("seller", "Bên bán", "party", ["Seller", "The Seller"]),
    f("buyer", "Bên mua", "party", ["Buyer", "The Buyer"]),
    f("incoterm", "Điều kiện giao hàng", "code", ["Terms of Delivery", "Price Terms"]),
    f("currency", "Mã tiền tệ", "code", ["Currency"]),
    f("totalAmount", "Tổng trị giá hợp đồng", "number", ["Total Amount", "Total Value"]),
    f("paymentTerms", "Phương thức thanh toán", "text", ["Payment", "Terms of Payment"]),
  ],
};

const ARRIVAL_NOTICE: DocCatalog = {
  kind: "ARRIVAL_NOTICE",
  fields: [
    f("billNo", "Vận đơn (HB/L)", "code", ["Vận đơn (HB/L)", "HB/L", "HBL", "HAWB", "B/L No"]),
    f("vessel", "Tàu / chuyến", "text", ["Tàu (Vessel)", "Vessel", "Chuyến bay (Flight)"]),
    f("eta", "Ngày đến (ETA)", "date", ["Ngày đến (ETA)", "ETA", "Arrival Date"]),
    f("portOfDischarge", "Cảng đến", "text", ["Đến (Port of Discharge)", "Đến", "Port of Discharge"]),
    f("finalDestination", "Nơi đến cuối", "text", ["Final Destination", "Place of Delivery"]),
    f("masterBillNo", "Vận đơn chính (MB/L)", "code", ["Vận đơn chính (MB/L)", "MB/L", "MBL", "MAWB"], 2),
    f("transportMode", "Phương thức vận chuyển", "code", ["Mode"], 2),
    f("flightNo", "Chuyến bay", "code", ["Chuyến bay (Flight)", "Flight"], 2),
    f("portOfLoading", "Nơi đi", "text", ["Từ", "From", "Port of Loading"], 2),
    f("packages", "Số lượng kiện", "number", ["SỐ LƯỢNG", "SỐ LƯỢNG / Packages", "Packages", "Quantity"], 2),
    f("packageUnit", "Loại kiện", "code", ["Kind of packages"], 2),
    f("grossWeightKg", "Khối lượng (kg)", "number", ["KHỐI LƯỢNG", "Gross Weight"], 2),
    f("warehouseCode", "Mã kho / CY", "code", ["Mã kho"], 2),
    f("warehouseName", "Kho / CY", "text", ["Kho / CY", "Kho", "CY", "Warehouse"], 2),
    f("note", "Ghi chú", "text", ["Ghi chú (Note)", "Note", "Remarks"], 2),
  ],
  items: {
    key: "charges",
    label: "Khoản phí",
    fields: [
      f("label", "Tên khoản phí", "text", ["Description", "Charges"]),
      f("amount", "Số tiền", "number", ["Amount"]),
      f("currency", "Tiền tệ", "code", ["Currency"]),
    ],
  },
};

const FREIGHT_INVOICE: DocCatalog = {
  kind: "FREIGHT_INVOICE",
  fields: [
    f("invoiceNo", "Số hóa đơn", "code", ["Ký hiệu", "Số", "Invoice No"]),
    f("date", "Ngày hóa đơn", "date", ["Ngày", "Date"]),
    f("issuer", "Đơn vị bán", "party", ["Đơn vị bán hàng", "Người bán"]),
    f("totalAmount", "Tổng tiền thanh toán", "number", ["Tổng tiền thanh toán", "Total"]),
    f("currency", "Tiền tệ", "code", ["Currency"]),
    f("vatAmount", "Tiền thuế GTGT", "number", ["Tiền thuế GTGT", "VAT"]),
    f("billRef", "Số vận đơn tham chiếu", "code", ["B/L", "B/L No", "AWB"], 2),
  ],
  items: {
    key: "services",
    label: "Dịch vụ",
    fields: [
      f("label", "Tên hàng hóa, dịch vụ", "text", ["Tên hàng hóa, dịch vụ", "Description"]),
      f("amount", "Thành tiền", "number", ["Thành tiền", "Amount"]),
    ],
  },
};

const OTHER: DocCatalog = {
  kind: "OTHER",
  fields: [f("title", "Tiêu đề chứng từ", "text", ["Title"]), f("summary", "Tóm tắt", "text", ["Summary"])],
};

export const DOC_CATALOG: Record<DocKind, DocCatalog> = { INVOICE, PACKING_LIST, BILL_OF_LADING, AIR_WAYBILL, CERT_OF_ORIGIN, SALES_CONTRACT, ARRIVAL_NOTICE, FREIGHT_INVOICE, OTHER };
