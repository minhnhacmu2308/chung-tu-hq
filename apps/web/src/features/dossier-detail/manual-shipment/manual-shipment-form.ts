// Form nhập tay dữ liệu lô hàng (ADR 0013): trạng thái form (chuỗi) ↔ ManualShipmentInput; lỗi theo ô, chữ lỗi theo ngôn ngữ giao diện.
import { ManualShipmentSchema, type ManualShipment, type ManualShipmentInput, type ProductCatalogItem } from "@kb/contracts";

export type ItemRow = { description: string; quantity: string; unit: string; unitPrice: string; origin: string; hsOnInvoice: string; partNo: string; catalogItemId: string | null };
export type ManualForm = {
  buyerName: string; buyerAddress: string; buyerCountry: string; buyerTaxCode: string;
  invoiceDate: string; incoterm: string; incotermPlace: string; currency: string; paymentTerms: string; poNo: string;
  portOfLoading: string; portOfDischarge: string; finalDestination: string; departureDate: string; vessel: string;
  packages: string; packageUnit: string; grossWeightKg: string; netWeightKg: string; containers: string;
  originCountry: string;
  /** Phương thức thanh toán ("" = chưa chọn) và L/C áp dụng; ký mã hiệu in trên Invoice/PL. */
  marks: string;
  items: ItemRow[];
};
/** Khóa lỗi: tên ô form hoặc `items.<i>.<trường>`; giá trị là loại lỗi (dịch ở component). */
export type ErrorKind = "required" | "positive" | "nonNegative" | "number" | "date" | "invalid";
export type ManualFormErrors = Record<string, ErrorKind>;

export const emptyItem = (): ItemRow => ({ description: "", quantity: "", unit: "", unitPrice: "", origin: "", hsOnInvoice: "", partNo: "", catalogItemId: null });

/** Chọn mặt hàng từ danh mục: điền tên, mã hàng, HS (gợi ý – vẫn phải xác nhận ở bước HS), đơn vị, xuất xứ; giữ số lượng / đơn giá đã nhập. */
export const itemFromProduct = (row: ItemRow, p: ProductCatalogItem): ItemRow => ({
  ...row, description: p.name, partNo: p.code ?? "", hsOnInvoice: p.hsCode, unit: p.unit ?? row.unit, origin: p.origin ?? row.origin, catalogItemId: p.id,
});

const s = (v: string | null | undefined) => v ?? "";

export function formFromData(d: ManualShipment | null, defaults: { currency: string; incoterm: string }): ManualForm {
  return {
    buyerName: s(d?.buyer.name), buyerAddress: s(d?.buyer.address), buyerCountry: s(d?.buyer.country), buyerTaxCode: s(d?.buyer.taxCode),
    invoiceDate: s(d?.invoice.date), incoterm: d?.invoice.incoterm ?? defaults.incoterm, incotermPlace: s(d?.invoice.incotermPlace), currency: d?.invoice.currency ?? defaults.currency,
    paymentTerms: s(d?.invoice.paymentTerms), poNo: s(d?.invoice.poNo),
    portOfLoading: s(d?.transport.portOfLoading), portOfDischarge: s(d?.transport.portOfDischarge), finalDestination: s(d?.transport.finalDestination),
    departureDate: s(d?.transport.departureDate), vessel: s(d?.transport.vessel), packages: s(d?.transport.packages), packageUnit: s(d?.transport.packageUnit),
    grossWeightKg: s(d?.transport.grossWeightKg), netWeightKg: s(d?.transport.netWeightKg), containers: (d?.transport.containers ?? []).map((c) => c.no).join(", "),
    originCountry: s(d?.origin.country),
    marks: s(d?.marks),
    items: d?.items.length
      ? d.items.map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice, origin: s(it.origin), hsOnInvoice: s(it.hsOnInvoice), partNo: s(it.partNo), catalogItemId: it.catalogItemId ?? null }))
      : [emptyItem()],
  };
}

/** Cùng quy ước với khối Chi phí (value-charges-form normalizeAmount): dấu chấm là phần thập phân, dấu phẩy là phân cách nghìn → bỏ. */
export const normalizeNumber = (raw: string) => raw.replace(/[\s,]/g, "");

/** Dòng trống hoàn toàn bị bỏ (người dùng bấm thêm dòng rồi không nhập). */
const blank = (r: ItemRow) => !r.description.trim() && !r.quantity.trim() && !r.unitPrice.trim() && !r.unit.trim();

const ITEM_ERR: Record<string, ErrorKind> = { description: "required", unit: "required", quantity: "positive", unitPrice: "nonNegative" };
const NUMERIC = new Set(["packages", "grossWeightKg", "netWeightKg"]);
const DATES = new Set(["invoiceDate", "departureDate"]);
const FORM_KEY: Record<string, keyof ManualForm> = {
  "buyer.name": "buyerName", "buyer.address": "buyerAddress", "buyer.country": "buyerCountry", "buyer.taxCode": "buyerTaxCode",
  "invoice.date": "invoiceDate", "invoice.incoterm": "incoterm", "invoice.incotermPlace": "incotermPlace", "invoice.currency": "currency", "invoice.paymentTerms": "paymentTerms", "invoice.poNo": "poNo",
  "transport.portOfLoading": "portOfLoading", "transport.portOfDischarge": "portOfDischarge", "transport.finalDestination": "finalDestination", "transport.departureDate": "departureDate",
  "transport.vessel": "vessel", "transport.packages": "packages", "transport.packageUnit": "packageUnit", "transport.grossWeightKg": "grossWeightKg", "transport.netWeightKg": "netWeightKg",
  "transport.containers": "containers", "origin.country": "originCountry",
};

export function toInput(f: ManualForm): { ok: true; value: ManualShipmentInput } | { ok: false; errors: ManualFormErrors } {
  const rows = f.items.map((r, i) => ({ r, i })).filter(({ r }) => !blank(r));
  const input: ManualShipmentInput = {
    buyer: { name: f.buyerName, address: f.buyerAddress, country: f.buyerCountry.toUpperCase(), taxCode: f.buyerTaxCode },
    invoice: { date: f.invoiceDate, incoterm: f.incoterm, incotermPlace: f.incotermPlace, currency: f.currency, paymentTerms: f.paymentTerms, poNo: f.poNo },
    transport: {
      portOfLoading: f.portOfLoading, portOfDischarge: f.portOfDischarge, finalDestination: f.finalDestination, departureDate: f.departureDate, vessel: f.vessel,
      packages: normalizeNumber(f.packages), packageUnit: f.packageUnit, grossWeightKg: normalizeNumber(f.grossWeightKg), netWeightKg: normalizeNumber(f.netWeightKg),
      containers: f.containers.split(/[,;\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean).map((no) => ({ no })),
    },
    origin: { country: f.originCountry.toUpperCase() },
    marks: f.marks,
    items: rows.map(({ r }) => ({
      description: r.description, quantity: normalizeNumber(r.quantity), unit: r.unit, unitPrice: normalizeNumber(r.unitPrice),
      origin: r.origin.toUpperCase(), hsOnInvoice: r.hsOnInvoice.replace(/\D/g, ""), partNo: r.partNo, catalogItemId: r.catalogItemId,
    })),
  };
  const parsed = ManualShipmentSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: input };
  const errors: ManualFormErrors = {};
  for (const issue of parsed.error.issues) {
    const [a, b, c] = issue.path.map(String);
    if (a === "items" && b !== undefined && c !== undefined) {
      errors[`items.${rows[Number(b)]?.i ?? b}.${c}`] ??= ITEM_ERR[c] ?? "invalid";
      continue;
    }
    const key = FORM_KEY[`${a}.${b}`];
    if (key) errors[key] ??= NUMERIC.has(key) ? "number" : DATES.has(key) ? "date" : "invalid";
  }
  return { ok: false, errors };
}
