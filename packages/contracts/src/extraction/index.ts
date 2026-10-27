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
export * from "./customs-declaration.js";
export * from "./freight-invoice.js";
export * from "./invoice.js";
export * from "./packing-list.js";
export * from "./sales-contract.js";

/** Tăng khi đổi bất kỳ schema trích xuất nào (B10). */
export const EXTRACTION_SCHEMA_VERSION = 3;

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

/**
 * Điền `null` cho key bị thiếu mà schema cho phép null (đệ quy vào object và phần tử mảng).
 * Structured output luôn trả đủ key; hàm này để kết quả/fixture ghi theo schema cũ (v1) vẫn parse được bằng schema mới.
 */
export function fillMissingNullable(schema: ZodType, value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const inner = unwrap(schema);
  if (inner instanceof z.ZodArray) return Array.isArray(value) ? value.map((v) => fillMissingNullable(inner.element as ZodType, v)) : value;
  if (!(inner instanceof z.ZodObject) || Array.isArray(value)) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [key, field] of Object.entries(inner.shape as Record<string, ZodType>)) {
    if (!(key in out)) {
      if (field.safeParse(null).success) out[key] = null;
      else if (unwrap(field) instanceof z.ZodObject) {
        // Object bắt buộc mà mọi trường con đều nullable (vd `custom` – trường bổ sung) → object toàn null.
        const empty = fillMissingNullable(field, {});
        if (field.safeParse(empty).success) out[key] = empty;
      }
    } else out[key] = fillMissingNullable(field, out[key]);
  }
  return out;
}

function unwrap(schema: ZodType): ZodType {
  let s: ZodType = schema;
  while (s instanceof z.ZodNullable || s instanceof z.ZodOptional) s = s.unwrap() as ZodType;
  return s;
}
export * from "./ai-schema.js";
