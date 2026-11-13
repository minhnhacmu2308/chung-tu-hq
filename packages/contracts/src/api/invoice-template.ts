// Mẫu in hóa đơn thương mại do doanh nghiệp tự thiết kế (ADR 0013 mục 3): ghép từ các nhóm thông tin chuẩn
// của Commercial Invoice (UCP600 Đ18, ISBP 821 mục C) – bật/tắt, sắp xếp, đổi nhãn; chọn cột bảng hàng.
// Hệ thống chỉ cung cấp ô và tiêu đề đúng chuẩn, KHÔNG đối chiếu L/C (quyết định 2026-11-12).
import { z } from "zod";
import { IsoDateTimeSchema } from "../common.js";

/** Nhóm thông tin in trên hóa đơn. Thứ tự trong mẫu = thứ tự in. */
export const InvoiceBlockKeySchema = z.enum([
  "SELLER", // Người bán / Beneficiary (Đ18(a)(i))
  "BUYER", // Người mua / Applicant (Đ18(a)(ii))
  "INVOICE_INFO", // Số, ngày hóa đơn, số PO / hợp đồng
  "LC_REF", // Số, ngày L/C, ngân hàng phát hành
  "SHIPMENT", // Cảng xếp/dỡ, nơi đến, tàu/chuyến, ngày đi, số B/L
  "TERMS", // Incoterms® + phiên bản, điều kiện thanh toán
  "DECLARATION", // Số tờ khai hải quan xuất khẩu
  "MARKS", // Ký mã hiệu
  "ITEMS", // Bảng hàng (Đ18(c) – mô tả hàng)
  "TOTALS", // Tổng tiền + số tiền bằng chữ (Đ18(a)(iii) – loại tiền)
  "PACKING", // Số kiện, trọng lượng, container
  "ORIGIN", // Xuất xứ
  "STATEMENT", // Câu xác nhận / ghi chú cuối
  "SIGNATURE", // Ô ký, người ký
]);
export type InvoiceBlockKey = z.infer<typeof InvoiceBlockKeySchema>;

export const InvoiceColumnKeySchema = z.enum(["LINE_NO", "DESCRIPTION", "PART_NO", "HS_CODE", "ORIGIN", "QUANTITY", "UNIT", "UNIT_PRICE", "AMOUNT"]);
export type InvoiceColumnKey = z.infer<typeof InvoiceColumnKeySchema>;

/** Nhóm/cột bắt buộc – không tắt được (thiếu thì không còn là hóa đơn thương mại). */
export const REQUIRED_BLOCKS: readonly InvoiceBlockKey[] = ["SELLER", "BUYER", "INVOICE_INFO", "ITEMS", "TOTALS"];
export const REQUIRED_COLUMNS: readonly InvoiceColumnKey[] = ["DESCRIPTION", "QUANTITY", "AMOUNT"];

const label = z.string().trim().max(60).transform((v) => (v === "" ? null : v)).nullable().default(null);
const note = z.string().trim().max(1000).transform((v) => (v === "" ? null : v)).nullable().default(null);

const uniqueKeys = <T extends { key: string }>(all: readonly string[], required: readonly string[]) => (xs: T[], c: z.RefinementCtx) => {
  const keys = xs.map((x) => x.key);
  if (new Set(keys).size !== keys.length) c.addIssue({ code: "custom", message: "Mỗi mục chỉ xuất hiện một lần" });
  for (const k of all) if (!keys.includes(k)) c.addIssue({ code: "custom", message: `Thiếu mục ${k}` });
  for (const x of xs) if (required.includes(x.key) && !(x as unknown as { visible: boolean }).visible) c.addIssue({ code: "custom", message: `Mục ${x.key} bắt buộc hiện` });
};

export const InvoiceLayoutSchema = z.object({
  /** Tiêu đề chứng từ. Không dùng "Proforma"/"Provisional" (ISBP 821 mục C). */
  title: z.string().trim().min(1).max(60).refine((v) => !/proforma|provisional/i.test(v), "Hóa đơn thương mại không được đặt tiêu đề Proforma/Provisional").default("COMMERCIAL INVOICE"),
  blocks: z.array(z.object({ key: InvoiceBlockKeySchema, visible: z.boolean(), label })).superRefine(uniqueKeys(InvoiceBlockKeySchema.options, REQUIRED_BLOCKS)),
  columns: z.array(z.object({ key: InvoiceColumnKeySchema, visible: z.boolean(), label })).superRefine(uniqueKeys(InvoiceColumnKeySchema.options, REQUIRED_COLUMNS)),
  /** Phiên bản Incoterms in kèm điều kiện giao hàng (ISBP 821 mục C). */
  incotermsVersion: z.enum(["2010", "2020"]).nullable().default("2020"),
  headerNote: note,
  /** Nội dung khối STATEMENT (vd "WE HEREBY CERTIFY THAT…"). */
  statement: note,
  /** Số bản ORIGINAL / COPY in ra (UCP600 Đ17). */
  originals: z.number().int().min(1).max(5).default(1),
  copies: z.number().int().min(0).max(5).default(0),
  /**
   * Bộ mã in ở cột mã hàng (PART_NO): { codeSetId } = bộ chỉ định · { kind: "ITEM_NO" } = luôn in mã nối · null = tự chọn
   * (bộ khách hàng của người mua → Kế toán, hoặc "Mã chung" ở chế độ SHARED → mã nối). Mặt hàng không có mã trong bộ → in mã nối.
   */
  itemCodeSet: z.union([z.object({ codeSetId: z.string().min(1).max(64) }), z.object({ kind: z.literal("ITEM_NO") })]).nullable().default(null),
});
export type InvoiceLayout = z.infer<typeof InvoiceLayoutSchema>;
export type InvoiceLayoutInput = z.input<typeof InvoiceLayoutSchema>;

/** Mẫu dựng sẵn – dùng khi doanh nghiệp chưa tạo mẫu nào. */
export const DEFAULT_INVOICE_LAYOUT: InvoiceLayout = {
  title: "COMMERCIAL INVOICE",
  blocks: InvoiceBlockKeySchema.options.map((key) => ({ key, visible: key !== "LC_REF" && key !== "DECLARATION", label: null })),
  columns: InvoiceColumnKeySchema.options.map((key) => ({ key, visible: key !== "PART_NO", label: null })),
  incotermsVersion: "2020",
  headerNote: null,
  statement: null,
  originals: 1,
  copies: 0,
  itemCodeSet: null,
};

export const InvoiceTemplateInputSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên mẫu").max(100),
  isDefault: z.boolean().default(false),
  layout: InvoiceLayoutSchema,
});
export type InvoiceTemplateInput = z.input<typeof InvoiceTemplateInputSchema>;

export const InvoiceTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  layout: InvoiceLayoutSchema,
  updatedAt: IsoDateTimeSchema,
});
export type InvoiceTemplate = z.infer<typeof InvoiceTemplateSchema>;
