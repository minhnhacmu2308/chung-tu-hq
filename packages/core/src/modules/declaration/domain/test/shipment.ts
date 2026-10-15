// Lô hàng mẫu HANSOL (dos_021): FCA + hóa đơn cước, C/O form AK, PL ≠ B/L về trọng lượng. Dùng cho test dựng tờ khai.
import { emptyShipment, type DocKind, type Shipment, type Sourced } from "@kb/contracts";
import type { DossierInfo, OrgInfo } from "../types.js";

const src = (value: string | null, kinds: DocKind[] = ["INVOICE"], status: Sourced<string>["status"] = kinds.length > 1 ? "CROSS_CHECKED" : "SINGLE_SOURCE"): Sourced<string> => ({
  value, sources: value === null ? [] : kinds.map((kind) => ({ documentId: `doc_${kind.toLowerCase()}`, kind, page: 1, raw: value, normalized: value })), status,
});

export function hansol(overrides: (s: Shipment) => void = () => {}): Shipment {
  const s = emptyShipment();
  s.version = 1;
  s.parties.seller = { name: src("HANSOL PRECISION CO., LTD.", ["INVOICE", "BILL_OF_LADING"]), address: src("45, Gongdan-ro, Changwon, Korea"), taxCode: src(null), country: src("KR") };
  s.parties.buyer = { name: src("AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", ["INVOICE", "BILL_OF_LADING"]), address: src("Lot B4, Trang Due IZ, Hai Phong"), taxCode: src("0316789012"), country: src("VN") };
  s.invoice = { ...s.invoice, no: src("HSP-2610-0457", ["INVOICE", "PACKING_LIST", "CERT_OF_ORIGIN"]), date: src("2026-10-02"), incoterm: src("FCA"), currency: src("USD"), totalAmount: src("20850"), paymentTerms: src("T/T 30 days after B/L date", ["INVOICE"], "MODEL_UNSURE"), poNo: src("AP-2609-114") };
  s.transport = { ...s.transport,
    mode: src("SEA", ["BILL_OF_LADING"]), billNo: src("HPSEL2610078", ["BILL_OF_LADING"]), masterBillNo: src("SITCHPH2610441", ["BILL_OF_LADING"]), vessel: src("SITC HAIPHONG", ["BILL_OF_LADING"]), voyage: src("2641S", ["BILL_OF_LADING"]),
    portOfLoading: src("BUSAN, KOREA", ["BILL_OF_LADING"]), portOfDischarge: src("HAIPHONG, VIETNAM", ["BILL_OF_LADING"]), finalDestination: src("TAN VU TERMINAL, HAIPHONG", ["BILL_OF_LADING"]), arrivalDate: src("2026-10-15", ["ARRIVAL_NOTICE"]),
    packages: src("48", ["PACKING_LIST", "BILL_OF_LADING"]), packageUnit: src("PL", ["PACKING_LIST"]), grossWeightKg: src("3860.5", ["PACKING_LIST", "BILL_OF_LADING"], "CONFLICT"), netWeightKg: src("3612", ["PACKING_LIST"]),
    containers: [{ no: "SITU2246781", sealNo: "KR2241100", size: "40HC" }],
  };
  s.origin = { ...s.origin, country: src("KR", ["CERT_OF_ORIGIN"]), coForm: src("AK", ["CERT_OF_ORIGIN"]), coNo: src("KR2610-0457-AK", ["CERT_OF_ORIGIN"]), rexNo: src(null), coInvoiceNo: src("HSP-2610-0457", ["CERT_OF_ORIGIN"]) };
  s.charges = { freight: src("1150", ["FREIGHT_INVOICE"]), insurance: src(null), other: [{ label: "THC", amount: "3200000", currency: "VND", sourceKind: "ARRIVAL_NOTICE" }, { label: "D/O fee", amount: "900000", currency: "VND", sourceKind: "ARRIVAL_NOTICE" }] };
  const item = (lineNo: number, description: string, quantity: string, unitPrice: string, amount: string, hs: string | null) => ({
    lineNo, description: src(description), quantity: src(quantity), unit: src("PCS"), unitPrice: src(unitPrice), amount: src(amount), origin: src("KR"), hsOnInvoice: src(hs), partNo: src(null) });
  s.items = [
    item(1, "Deep groove ball bearing 6205-2RS", "2000", "1.85", "3700", "8482.10.1000"), item(2, "Deep groove ball bearing 6308ZZ", "800", "4.2", "3360", "8482.10.1000"),
    item(3, "Tapered roller bearing 30210", "400", "6.75", "2700", "8482.20.0000"), item(4, "Cylindrical roller bearing NU2212", "150", "18.4", "2760", "8482.50.0000"),
    item(5, "Linear guide rail HGR25", "120", "32.5", "3900", null), item(6, "Linear guide block HGH25CA", "240", "12.3", "2952", null), item(7, "Pillow block bearing unit UCP208", "200", "7.39", "1478", "8483.20.0000"),
  ];
  s.documents = [{ id: "doc_invoice", kind: "INVOICE", pages: 2 }, { id: "doc_packing_list", kind: "PACKING_LIST", pages: 1 }, { id: "doc_bill_of_lading", kind: "BILL_OF_LADING", pages: 1 }];
  overrides(s);
  return s;
}

export const DOSSIER: DossierInfo = {
  id: "dos_1", code: "HS-NK-2610-021", direction: "NK", typeCode: "A11", partner: "HANSOL PRECISION", customsOfficeCode: "03CE", customsOfficeName: "Chi cục HQ CK cảng Hải Phòng KV III", status: "NEEDS_REVIEW", step: "agent",
  ownerId: "usr_chau", invoiceValue: "20850", currency: "USD", incoterm: "FCA", transportMode: "SEA_CONTAINER", partyClass: "4", billNo: "HPSEL2610078", declarationNo: null, note: null,
};
export const ORG: OrgInfo = { taxCode: "0316789012", name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT", address: "Lô B4, KCN Tràng Duệ, An Dương, Hải Phòng", phone: "0225 3 888 123", fourEyes: false };
