// Shipment mẫu cho test luật – mô phỏng hồ sơ HANSOL (dos_021) từ seed FE: FCA, có hóa đơn cước, PL khớp B/L trừ trọng lượng.
import { emptyShipment, type Shipment, type Sourced } from "@kb/contracts";
import type { DossierProfile } from "../helpers.js";

export const src = (value: string | null, kinds: ("INVOICE" | "PACKING_LIST" | "BILL_OF_LADING" | "CERT_OF_ORIGIN" | "FREIGHT_INVOICE" | "ARRIVAL_NOTICE" | "SALES_CONTRACT")[] = ["INVOICE"], raws?: string[]): Sourced<string> => ({
  value,
  sources: value === null ? [] : kinds.map((kind, i) => ({ documentId: `doc_${kind.toLowerCase()}`, kind, page: 1, raw: raws?.[i] ?? value, normalized: value })),
  status: value === null ? "SINGLE_SOURCE" : kinds.length > 1 ? "CROSS_CHECKED" : "SINGLE_SOURCE",
});
export const item = (lineNo: number, description: string, quantity: string, unit: string, unitPrice: string, amount: string, origin: string, hs: string | null) => ({
  lineNo, description: src(description), quantity: src(quantity), unit: src(unit), unitPrice: src(unitPrice), amount: src(amount), origin: src(origin), hsOnInvoice: src(hs),
});

export function hansol(overrides: (s: Shipment) => void = () => {}): Shipment {
  const s = emptyShipment();
  s.version = 1;
  s.parties.seller = { name: src("HANSOL PRECISION CO., LTD.", ["INVOICE", "BILL_OF_LADING"]), address: src("Changwon, Korea"), taxCode: src(null), country: src("KR") };
  s.parties.buyer = { name: src("AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", ["INVOICE", "BILL_OF_LADING"]), address: src("Hai Phong"), taxCode: src("0316789012"), country: src("VN") };
  s.invoice = { no: src("HSP-2610-0457", ["INVOICE", "PACKING_LIST", "CERT_OF_ORIGIN"]), date: src("2026-10-02"), incoterm: src("FCA"), currency: src("USD"), totalAmount: src("20850"), paymentTerms: src("T/T"), poNo: src("AP-2609-114") };
  s.transport = {
    mode: src("SEA", ["BILL_OF_LADING"]), billNo: src("HPSEL2610078", ["BILL_OF_LADING"]), masterBillNo: src(null), vessel: src("SITC HAIPHONG", ["BILL_OF_LADING"]), voyage: src("2641S", ["BILL_OF_LADING"]),
    portOfLoading: src("BUSAN, KOREA", ["BILL_OF_LADING"]), portOfDischarge: src("HAIPHONG, VIETNAM", ["BILL_OF_LADING"]), finalDestination: src(null), arrivalDate: src("2026-10-15", ["ARRIVAL_NOTICE"]),
    packages: src("48", ["PACKING_LIST", "BILL_OF_LADING"]), packageUnit: src("PL", ["PACKING_LIST"]), grossWeightKg: src("3860.5", ["PACKING_LIST", "BILL_OF_LADING"], ["3.860,50", "3860.5"]), netWeightKg: src("3600", ["PACKING_LIST"]),
    containers: [{ no: "CMAU1234452", sealNo: "S1", size: "40HC" }],
  };
  s.origin = { country: src("KR", ["CERT_OF_ORIGIN"]), coForm: src("AK", ["CERT_OF_ORIGIN"]), coNo: src("KR2610-0457-AK", ["CERT_OF_ORIGIN"]), rexNo: src(null), coInvoiceNo: src("HSP-2610-0457", ["CERT_OF_ORIGIN"]) };
  s.charges = { freight: src("1150", ["FREIGHT_INVOICE"]), insurance: src(null), other: [] };
  s.items = [
    item(1, "Vòng bi cầu 6205-2RS", "2000", "PCE", "1.85", "3700", "KR", "8482.10.1000"),
    item(2, "Vòng bi cầu 6308ZZ", "800", "PCE", "4.20", "3360", "KR", "8482.10.1000"),
    item(3, "Ổ bi đũa côn 30210", "400", "PCE", "6.75", "2700", "KR", "8482.20.0000"),
    item(4, "Ổ bi đũa trụ NU2212", "150", "PCE", "18.40", "2760", "KR", null),
    item(5, "Thanh trượt HGR25", "120", "PCE", "32.50", "3900", "KR", null),
    item(6, "Con trượt HGH25CA", "240", "PCE", "12.30", "2952", "KR", null),
    item(7, "Gối đỡ UCP208", "200", "SET", "7.39", "1478", "KR", null),
  ];
  s.documents = [
    { id: "doc_invoice", kind: "INVOICE", pages: 2 }, { id: "doc_packing_list", kind: "PACKING_LIST", pages: 1 }, { id: "doc_bill_of_lading", kind: "BILL_OF_LADING", pages: 1 },
    { id: "doc_cert_of_origin", kind: "CERT_OF_ORIGIN", pages: 1 }, { id: "doc_freight_invoice", kind: "FREIGHT_INVOICE", pages: 1 }, { id: "doc_arrival_notice", kind: "ARRIVAL_NOTICE", pages: 1 },
  ];
  overrides(s);
  return s;
}

export const ORG = { taxCode: "0316789012", name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT" };

/** Hồ sơ mẫu (RuleContext.dossier). */
export const NK_SEA: DossierProfile = { direction: "NK", typeCode: "A11", transportMode: "SEA_CONTAINER" };
export const NK_AIR: DossierProfile = { direction: "NK", typeCode: "A11", transportMode: "AIR" };
export const XK_SEA: DossierProfile = { direction: "XK", typeCode: "B11", transportMode: "SEA_CONTAINER" };

/** Lô xuất mẫu: An Phát bán cho người mua Nhật (FOB Hải Phòng), 2 container có seal. */
export function anphatExport(overrides: (s: Shipment) => void = () => {}): Shipment {
  return hansol((s) => {
    s.parties.seller = { name: src("AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", ["INVOICE"]), address: src("Hai Phong, Vietnam"), taxCode: src("0316789012"), country: src("VN") };
    s.parties.buyer = { name: src("TOKYO BEARING TRADING CORPORATION", ["INVOICE", "BILL_OF_LADING"]), address: src("1-3-2 Kasumigaseki, Chiyoda-ku, Tokyo"), taxCode: src(null), country: src("JP") };
    s.invoice.incoterm = src("FOB HAIPHONG");
    s.transport.portOfLoading = src("HAIPHONG, VIETNAM", ["BILL_OF_LADING"]);
    s.transport.portOfDischarge = src("TOKYO, JAPAN", ["BILL_OF_LADING"]);
    s.transport.containers = [{ no: "TGHU1234567", sealNo: "VN001", size: "40HC" }, { no: "TGHU7654321", sealNo: "VN002", size: "20GP" }];
    s.charges = { freight: src(null), insurance: src(null), other: [] };
    overrides(s);
  });
}
