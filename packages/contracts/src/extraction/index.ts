import type { ZodType } from "zod";
import { z } from "zod";
import type { DocKind } from "../common.js";
import { AirWaybillExtractionSchema } from "./air-waybill.js";
import { ArrivalNoticeExtractionSchema } from "./arrival-notice.js";
import { BillOfLadingExtractionSchema } from "./bill-of-lading.js";
import { CertOfOriginExtractionSchema } from "./cert-of-origin.js";
import { UncertaintiesSchema } from "./common.js";
import { FreightInvoiceExtractionSchema } from "./freight-invoice.js";
import { InvoiceExtractionSchema } from "./invoice.js";
import { PackingListExtractionSchema } from "./packing-list.js";
import { SalesContractExtractionSchema } from "./sales-contract.js";

export * from "./air-waybill.js";
export * from "./arrival-notice.js";
export * from "./bill-of-lading.js";
export * from "./cert-of-origin.js";
export * from "./classify.js";
export * from "./common.js";
export * from "./freight-invoice.js";
export * from "./invoice.js";
export * from "./packing-list.js";
export * from "./sales-contract.js";

/** Tăng khi đổi bất kỳ schema trích xuất nào (B10). */
export const EXTRACTION_SCHEMA_VERSION = 1;

/** Chứng từ loại OTHER: chỉ lấy tiêu đề + tóm tắt để người dùng xếp loại. */
export const OtherExtractionSchema = z.object({
  title: z.string().nullable().describe("Tiêu đề chứng từ"),
  summary: z.string().nullable().describe("Tóm tắt 1–2 câu nội dung"),
  uncertainties: UncertaintiesSchema,
});

const BY_KIND: Record<DocKind, ZodType> = {
  INVOICE: InvoiceExtractionSchema,
  PACKING_LIST: PackingListExtractionSchema,
  BILL_OF_LADING: BillOfLadingExtractionSchema,
  AIR_WAYBILL: AirWaybillExtractionSchema,
  CERT_OF_ORIGIN: CertOfOriginExtractionSchema,
  SALES_CONTRACT: SalesContractExtractionSchema,
  ARRIVAL_NOTICE: ArrivalNoticeExtractionSchema,
  FREIGHT_INVOICE: FreightInvoiceExtractionSchema,
  OTHER: OtherExtractionSchema,
};

export function extractionSchemaFor(kind: DocKind): ZodType {
  return BY_KIND[kind];
}
