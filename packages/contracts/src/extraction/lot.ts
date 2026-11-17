// Khối thông tin lô hàng (`lot`) đọc trên mọi loại chứng từ: cảng, tàu, container, L/C… in trên chứng từ nào cũng lấy.
// Lồng riêng để không đụng nghĩa trường sẵn có của loại (FREIGHT_INVOICE.invoiceNo là hóa đơn cước, lot.invoiceNo là hóa đơn thương mại).
// Mọi giá trị là chuỗi nguyên văn (kể cả số, ngày): chuẩn hóa khi gộp lô hàng.
import { z } from "zod";
import type { DocKind } from "../common.js";
import { PAYMENT_METHODS } from "../declaration/code-tables.js";
import { nStr } from "./common.js";

export const LOT_KEYS = [
  "portOfLoading", "portOfDischarge", "vessel", "voyage", "flightNo", "billNo", "masterBillNo", "departureDate", "arrivalDate",
  "packages", "packageUnit", "grossWeightKg", "netWeightKg", "volumeCbm", "marks", "freightTerm",
  "incoterm", "incotermPlace", "currency", "paymentTerms", "lcNo", "poNo", "contractNo", "invoiceNo", "invoiceDate",
] as const;
export type LotKey = (typeof LOT_KEYS)[number];

const lot = (desc: string) => nStr(`Chỉ chép nếu in trên chứng từ: ${desc}`);

export const LotSchema = z.object({
  portOfLoading: lot("cảng / sân bay xếp hàng (Port of Loading, From) nguyên văn"),
  portOfDischarge: lot("cảng / sân bay dỡ hàng (Port of Discharge, To) nguyên văn"),
  vessel: lot("tên tàu (Vessel), không kèm số chuyến"),
  voyage: lot("số chuyến tàu (Voyage No.)"),
  flightNo: lot("số hiệu chuyến bay (Flight No.)"),
  billNo: lot("số vận đơn (B/L No., HBL, HAWB)"),
  masterBillNo: lot("số vận đơn chủ (MBL, MAWB)"),
  departureDate: lot("ngày khởi hành / ngày tàu chạy (ETD, On board date), dạng YYYY-MM-DD theo quy ước ngày của chứng từ"),
  arrivalDate: lot("ngày đến dự kiến (ETA), dạng YYYY-MM-DD theo quy ước ngày của chứng từ"),
  packages: lot("tổng số kiện, chỉ phần số"),
  packageUnit: lot("loại kiện (CARTON, PALLET, PACKAGE…)"),
  grossWeightKg: lot("tổng trọng lượng cả bì, kèm đơn vị như in"),
  netWeightKg: lot("tổng trọng lượng tịnh, kèm đơn vị như in"),
  volumeCbm: lot("tổng thể tích (CBM, m3)"),
  marks: lot("ký mã hiệu (Marks & Nos) nguyên văn"),
  freightTerm: lot("điều kiện cước (Freight Prepaid / Collect)"),
  incoterm: lot("điều kiện giao hàng (FOB, CIF, EXW…)"),
  incotermPlace: lot("địa danh đi kèm điều kiện giao hàng (FOB BUSAN → BUSAN)"),
  currency: lot("mã tiền tệ của hàng hóa (hóa đơn thương mại), không phải tiền tệ cước (USD, EUR…)"),
  paymentTerms: lot("điều khoản thanh toán nguyên văn"),
  lcNo: lot("số thư tín dụng (L/C No., Documentary Credit No.)"),
  poNo: lot("số đơn đặt hàng (P/O No., Order No.)"),
  contractNo: lot("số hợp đồng (Contract No., S/C No.)"),
  invoiceNo: lot("số hóa đơn thương mại (Commercial Invoice No.)"),
  invoiceDate: lot("ngày hóa đơn thương mại, dạng YYYY-MM-DD theo quy ước ngày của chứng từ"),
} satisfies Record<LotKey, z.ZodType>);

export const LotContainersSchema = z
  .array(z.object({ no: z.string().describe("Số container (4 chữ + 7 số)"), sealNo: nStr("Số chì (Seal No.)"), size: nStr("Loại/cỡ: 20GP, 40HC…") }))
  .describe("Container in trên chứng từ; không in thì mảng rỗng");

/** Key bỏ khỏi `lot` của loại vì loại đã có trường CÙNG NGHĨA (không chỉ cùng tên) – model không chép hai lần. */
export const LOT_OMIT: Partial<Record<DocKind, LotKey[]>> = {
  INVOICE: ["invoiceNo", "invoiceDate", "incoterm", "incotermPlace", "currency", "paymentTerms", "poNo", "packages", "grossWeightKg"],
  PACKING_LIST: ["invoiceNo", "packages", "packageUnit", "grossWeightKg", "netWeightKg", "volumeCbm", "marks"],
  BILL_OF_LADING: ["billNo", "masterBillNo", "vessel", "voyage", "portOfLoading", "portOfDischarge", "packages", "packageUnit", "grossWeightKg", "freightTerm"],
  // awbNo = MAWB, hawbNo = HAWB, flight, sân bay đi/đến, pieces, flightDate.
  AIR_WAYBILL: ["billNo", "masterBillNo", "flightNo", "portOfLoading", "portOfDischarge", "packages", "grossWeightKg", "departureDate"],
  // transportName gộp tàu/chuyến bay.
  CERT_OF_ORIGIN: ["invoiceNo", "invoiceDate", "departureDate", "vessel", "flightNo", "portOfLoading", "portOfDischarge"],
  SALES_CONTRACT: ["contractNo", "incoterm", "currency", "paymentTerms"],
  // vessel của Arrival Notice gộp tàu/chuyến → giữ lot.vessel, lot.voyage để tách.
  ARRIVAL_NOTICE: ["billNo", "masterBillNo", "arrivalDate", "portOfDischarge", "flightNo", "portOfLoading", "packages", "packageUnit", "grossWeightKg"],
  // invoiceNo, currency là của hóa đơn cước → giữ lot.invoiceNo, lot.currency; billRef = số vận đơn.
  FREIGHT_INVOICE: ["billNo"],
};

/** Thứ tự cố định các loại chứng từ khi nối nguồn `lot` sau nguồn tay của ô (gộp lấy giá trị nguồn đầu tiên khác rỗng) – server và web dùng chung. */
export const LOT_KIND_ORDER: DocKind[] = ["BILL_OF_LADING", "AIR_WAYBILL", "ARRIVAL_NOTICE", "INVOICE", "PACKING_LIST", "SALES_CONTRACT", "FREIGHT_INVOICE", "CERT_OF_ORIGIN", "OTHER"];
/** Loại chứng từ có `paymentMethodCode`, theo thứ tự ưu tiên khi gộp – server và web dùng chung. */
export const PAYMENT_CODE_KINDS: DocKind[] = ["INVOICE", "SALES_CONTRACT", "OTHER"];

export function lotSchemaFor(kind: DocKind) {
  return LotSchema.omit(Object.fromEntries((LOT_OMIT[kind] ?? []).map((k) => [k, true])) as Partial<Record<LotKey, true>>);
}

const PAYMENT_CODES = PAYMENT_METHODS.map((p) => p.code) as [string, ...string[]];

/** Mã phương thức thanh toán TK_IVP (1.43 / 2.38) do AI chọn; kiểm chéo với resolvePayment khi gộp. */
export const PaymentMethodCodeSchema = z
  .enum(PAYMENT_CODES)
  .nullable()
  .describe(
    `Mã phương thức thanh toán TK_IVP theo điều khoản thanh toán in trên chứng từ: ${PAYMENT_METHODS.map((p) => `${p.code} = ${p.label}`).join("; ")}. ` +
      "Quy tắc: T/T, chuyển khoản, wire → KC (KHÔNG phải TTR); TTR chỉ là chuyển tiền bồi hoàn L/C; documentary credit / có số L/C → LC; " +
      "đặt cọc + T/T phần còn lại → KC; không có thông tin thanh toán → null",
  );
