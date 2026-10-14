// Dữ liệu lô hàng đã gộp từ mọi chứng từ. Mỗi giá trị kèm nguồn (chứng từ, trang, vùng, chuỗi gốc) và trạng thái ADR 0003.
import { z } from "zod";
import { DecimalStringSchema, DocKindSchema, FieldStatusSchema, IsoDateSchema } from "./common.js";
import { RegionSchema } from "./dto/ocr.js";

export const SourceRefSchema = z.object({
  documentId: z.string(),
  kind: DocKindSchema,
  page: z.number().int().positive(),
  region: RegionSchema.optional(),
  /** Chuỗi nguyên văn trên chứng từ. */
  raw: z.string(),
  /** Giá trị đã chuẩn hóa của riêng nguồn này (số dấu chấm, ngày ISO, mã) – luật đối chiếu so sánh bằng trường này. */
  normalized: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

const sourced = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value: value.nullable(), sources: z.array(SourceRefSchema), status: FieldStatusSchema, note: z.string().optional() });
export type Sourced<T> = { value: T | null; sources: SourceRef[]; status: z.infer<typeof FieldStatusSchema>; note?: string | undefined };

const str = () => sourced(z.string());
const dec = () => sourced(DecimalStringSchema);
const date = () => sourced(IsoDateSchema);

export const ShipmentPartySchema = z.object({ name: str(), address: str(), taxCode: str(), country: str() });
export const ShipmentItemSchema = z.object({
  lineNo: z.number().int().positive(),
  description: str(),
  quantity: dec(),
  unit: str(),
  unitPrice: dec(),
  amount: dec(),
  origin: str(),
  hsOnInvoice: str(),
});
export type ShipmentItem = z.infer<typeof ShipmentItemSchema>;

export const ShipmentSchema = z.object({
  version: z.number().int().nonnegative(),
  parties: z.object({ seller: ShipmentPartySchema, buyer: ShipmentPartySchema }),
  invoice: z.object({ no: str(), date: date(), incoterm: str(), currency: str(), totalAmount: dec(), paymentTerms: str(), poNo: str() }),
  transport: z.object({
    mode: str(),
    billNo: str(),
    masterBillNo: str(),
    vessel: str(),
    voyage: str(),
    portOfLoading: str(),
    portOfDischarge: str(),
    finalDestination: str(),
    arrivalDate: date(),
    packages: dec(),
    packageUnit: str(),
    grossWeightKg: dec(),
    netWeightKg: dec(),
    containers: z.array(z.object({ no: z.string(), sealNo: z.string().nullable(), size: z.string().nullable() })),
  }),
  origin: z.object({ country: str(), coForm: str(), coNo: str(), rexNo: str(), coInvoiceNo: str() }),
  charges: z.object({
    freight: dec(),
    /** Tiền tệ của cước (hóa đơn GTGT cước thường là VND, khác tiền tệ hóa đơn). Thiếu → coi như tiền tệ hóa đơn. */
    freightCurrency: str().optional(),
    insurance: dec(),
    insuranceCurrency: str().optional(),
    other: z.array(z.object({ label: z.string(), amount: DecimalStringSchema, currency: z.string(), sourceKind: DocKindSchema })),
  }),
  items: z.array(ShipmentItemSchema),
  documents: z.array(z.object({ id: z.string(), kind: DocKindSchema, pages: z.number().int().nonnegative() })),
});
export type Shipment = z.infer<typeof ShipmentSchema>;

const empty = <T>(): Sourced<T> => ({ value: null, sources: [], status: "SINGLE_SOURCE" });
const emptyParty = () => ({ name: empty<string>(), address: empty<string>(), taxCode: empty<string>(), country: empty<string>() });

export function emptyShipment(): Shipment {
  return {
    version: 0,
    parties: { seller: emptyParty(), buyer: emptyParty() },
    invoice: { no: empty(), date: empty(), incoterm: empty(), currency: empty(), totalAmount: empty(), paymentTerms: empty(), poNo: empty() },
    transport: {
      mode: empty(), billNo: empty(), masterBillNo: empty(), vessel: empty(), voyage: empty(), portOfLoading: empty(), portOfDischarge: empty(),
      finalDestination: empty(), arrivalDate: empty(), packages: empty(), packageUnit: empty(), grossWeightKg: empty(), netWeightKg: empty(), containers: [],
    },
    origin: { country: empty(), coForm: empty(), coNo: empty(), rexNo: empty(), coInvoiceNo: empty() },
    charges: { freight: empty(), insurance: empty(), other: [] },
    items: [],
    documents: [],
  };
}
