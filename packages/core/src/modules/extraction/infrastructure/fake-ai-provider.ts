// AI giả cho dev/test: không gọi mạng. Ưu tiên fixture theo sha256 (evals/fixtures); không có → sinh bộ dữ liệu HANSOL
// nhất quán giữa các loại chứng từ (có một chỗ lệch cố ý: trọng lượng B/L) để màn OCR có CROSS_CHECKED/CONFLICT như demo.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ClassifyResult, DocKind } from "@kb/contracts";
import type { ZodType } from "zod";
import type { AiFile, AiProvider, ExtractPrompt } from "../application/ports.js";

const party = (name: string, address: string, country: string, taxCode: string | null = null) => ({ name, address, taxCode, country });
const SELLER = party("HANSOL PRECISION CO., LTD.", "45, Gongdan-ro 140beon-gil, Seongsan-gu, Changwon-si, Gyeongsangnam-do, KOREA", "KR");
const BUYER = party("AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", "Lot B4, Trang Due IZ, An Duong, Hai Phong, VIETNAM", "VN", "0316789012");
const ITEMS = [
  { lineNo: 1, description: "Deep groove ball bearing 6205-2RS, bore 25 mm", hsCodeOnInvoice: "8482.10.1000", quantity: 2000, unit: "PCS", unitPrice: 1.85, amount: 3700, origin: "KR", partNo: "6205-2RS" },
  { lineNo: 2, description: "Deep groove ball bearing 6308ZZ, bore 40 mm", hsCodeOnInvoice: "8482.10.1000", quantity: 800, unit: "PCS", unitPrice: 4.2, amount: 3360, origin: "KR", partNo: null },
  { lineNo: 3, description: "Tapered roller bearing 30210", hsCodeOnInvoice: "8482.20.0000", quantity: 400, unit: "PCS", unitPrice: 6.75, amount: 2700, origin: "KR", partNo: null },
  { lineNo: 4, description: "Cylindrical roller bearing NU2212", hsCodeOnInvoice: "8482.50.0000", quantity: 150, unit: "PCS", unitPrice: 18.4, amount: 2760, origin: "KR", partNo: null },
  { lineNo: 5, description: "Linear guide rail HGR25, L=1000 mm", hsCodeOnInvoice: null, quantity: 120, unit: "PCS", unitPrice: 32.5, amount: 3900, origin: "KR", partNo: null },
  { lineNo: 6, description: "Linear guide block HGH25CA", hsCodeOnInvoice: null, quantity: 240, unit: "PCS", unitPrice: 12.3, amount: 2952, origin: "KR", partNo: null },
  { lineNo: 7, description: "Pillow block bearing unit UCP208", hsCodeOnInvoice: "8483.20.0000", quantity: 200, unit: "SET", unitPrice: 7.39, amount: 1478, origin: "KR", partNo: null },
];

export const FAKE_BY_KIND: Record<DocKind, unknown> = {
  INVOICE: { invoiceNo: "HSP-2610-0457", invoiceDate: "2026-10-02", seller: SELLER, buyer: BUYER, incoterm: "FCA", currency: "USD", totalAmount: 20850, paymentTerms: "T/T 30 days after B/L date", poNo: "AP-2609-114", items: ITEMS, grossWeightKg: 3860.5, packages: 48, incotermPlace: "CHANGWON", originStatement: "Made in Korea", uncertainties: ["paymentTerms"] },
  PACKING_LIST: { invoiceNo: "HSP-2610-0457", date: "2026-10-02", packages: 48, packageUnit: "PALLET", grossWeightKg: 3860.5, netWeightKg: 3612, volumeCbm: 12.4, marks: "AN PHAT / HAI PHONG / C/No. 1-48", items: ITEMS.map((i) => ({ lineNo: i.lineNo, description: i.description, quantity: i.quantity, unit: i.unit, packages: null, netWeightKg: null, grossWeightKg: null })), uncertainties: [] },
  BILL_OF_LADING: { billNo: "HPSEL2610078", masterBillNo: "SITCHPH2610441", date: "2026-10-05", shipper: SELLER, consignee: BUYER, notifyParty: BUYER, vessel: "SITC HAIPHONG", voyage: "2641S", portOfLoading: "BUSAN, KOREA", portOfDischarge: "HAIPHONG, VIETNAM", placeOfDelivery: "TAN VU TERMINAL, HAIPHONG", containers: [{ no: "SITU2246781", sealNo: "KR2241100", size: "40HC" }], packages: 48, packageUnit: "PALLETS", grossWeightKg: 3842, placeOfIssue: "BUSAN, KOREA", dateOfIssue: "2026-10-05", freightTerm: "COLLECT", uncertainties: [] },
  AIR_WAYBILL: { awbNo: "618-44021375", hawbNo: "HPH26100912", date: "2026-10-05", shipper: SELLER, consignee: BUYER, flight: "KE483", airportOfDeparture: "INCHEON (ICN)", airportOfDestination: "HANOI NOI BAI (HAN)", pieces: 12, grossWeightKg: 318.5, chargeableWeightKg: 340, flightDate: "2026-10-05", placeOfIssue: "INCHEON", uncertainties: [] },
  CERT_OF_ORIGIN: { form: "AK", coNo: "KR2610-0457-AK", issueDate: "2026-10-06", exporter: SELLER, consignee: BUYER, invoiceNo: "HSP-2610-0457", invoiceDate: "2026-10-02", originCountry: "KR", items: ITEMS.slice(0, 4).map((i) => ({ description: i.description, hs6: (i.hsCodeOnInvoice ?? "").replace(/\D/g, "").slice(0, 6) || null, criterion: "WO" })), rexNo: null, departureDate: "2026-10-05", transportName: "SITC HAIPHONG V.2641S", portOfLoading: "BUSAN, KOREA", portOfDischarge: "HAIPHONG, VIETNAM", packagesDescription: "48 PALLETS OF BEARINGS", quantityOrWeight: "3,860.5 KGS", certified: true, uncertainties: [] },
  SALES_CONTRACT: { contractNo: "HSP-AP-2026-03", date: "2026-03-15", seller: SELLER, buyer: BUYER, incoterm: "FCA", currency: "USD", totalAmount: 250000, paymentTerms: "T/T 30 days", uncertainties: [] },
  ARRIVAL_NOTICE: { billNo: "HPSEL2610078", vessel: "SITC HAIPHONG V.2641S", eta: "2026-10-15", portOfDischarge: "HAIPHONG", finalDestination: "TAN VU TERMINAL, HAI PHONG", masterBillNo: "SITCHPH2610441", transportMode: "SEA", flightNo: null, portOfLoading: "BUSAN", packages: null, packageUnit: null, grossWeightKg: null, warehouseCode: "03CCS01", warehouseName: "KHO CFS TÂN VŨ", note: "CFS/CFS", charges: [{ label: "Ocean freight collect", amount: 1150, currency: "USD" }, { label: "THC", amount: 3200000, currency: "VND" }, { label: "D/O fee", amount: 900000, currency: "VND" }], uncertainties: [] },
  FREIGHT_INVOICE: { invoiceNo: "1C26TKH-0004512", date: "2026-10-14", issuer: party("CÔNG TY TNHH GIAO NHẬN KHANG HƯNG", "Hải Phòng", "VN", "0201234567"), totalAmount: 33500000, currency: "VND", vatAmount: 2600000, billRef: "HPSEL2610078", services: [{ label: "Cước vận chuyển quốc tế (Ocean freight) HPSEL2610078", amount: 29200000 }, { label: "Phí THC", amount: 3200000 }, { label: "Phí D/O", amount: 900000 }], uncertainties: [] },
  OTHER: { title: "Chứng từ khác", summary: "Không nhận ra loại chứng từ; người dùng chọn loại rồi đọc lại.", uncertainties: [] },
};

function guessKind(fileName: string): DocKind {
  const n = fileName.toLowerCase();
  if (/packing|\bpl\b/.test(n)) return "PACKING_LIST";
  if (/awb|airway/.test(n)) return "AIR_WAYBILL";
  if (/\bbl\b|lading|hbl|mbl/.test(n)) return "BILL_OF_LADING";
  if (/\bco\b|origin|form/.test(n)) return "CERT_OF_ORIGIN";
  if (/arrival|notice/.test(n)) return "ARRIVAL_NOTICE";
  if (/cuoc|freight|gtgt/.test(n)) return "FREIGHT_INVOICE";
  if (/contract/.test(n)) return "SALES_CONTRACT";
  if (/inv|invoice/.test(n)) return "INVOICE";
  return "OTHER";
}

export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  constructor(private fixturesDir?: string) {}
  private fixture(bytes: Buffer, suffix: string): unknown | null {
    if (!this.fixturesDir) return null;
    const f = path.join(this.fixturesDir, `${createHash("sha256").update(bytes).digest("hex")}.${suffix}.json`);
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as unknown) : null;
  }
  async classifyPages(file: AiFile) {
    const fx = this.fixture(file.bytes, "classify") as ClassifyResult | null;
    const result: ClassifyResult = fx ?? { documents: [{ kind: guessKind(file.fileName), pages: Array.from({ length: Math.max(1, file.pages) }, (_, i) => i + 1), isDuplicateCopy: false, supplierHint: "HANSOL" }] };
    return { result, usage: { model: "fake", inputTokens: 0, outputTokens: 0 } };
  }
  async extract(file: AiFile, _pages: number[], _schema: ZodType, prompt: ExtractPrompt) {
    const fx = this.fixture(file.bytes, `extract.${prompt.kind}`);
    return { result: fx ?? FAKE_BY_KIND[prompt.kind], regions: null, usage: { model: "fake", inputTokens: 0, outputTokens: 0 } };
  }
}
