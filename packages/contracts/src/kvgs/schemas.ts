import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema } from "../common.js";
import { CustomsErrorSchema } from "../dto/customs.js";
import { isValidContainerNo, normalizeContainerNo } from "./container-no.js";

/** Một dòng danh sách container (V5ContainerReq: VD_SO ≤35, CON_SO/SEL_SO ≤50, GHI_CHU ≤255). Mã định danh là chuỗi. */
export const ContainerListRowSchema = z.object({
  billNo: z.string().min(1).max(35),
  containerNo: z.string().min(1).max(50),
  sealNo: z.string().max(50),
  note: z.string().max(255),
  source: z.enum(["OCR", "USER"]),
  sourceDocumentId: z.string().optional(),
  sourcePage: z.number().int().positive().optional(),
});
export type ContainerListRow = z.infer<typeof ContainerListRowSchema>;

/** `V5ContainerRes.tranG_THAI`: 0 nhập mới, 12 chấp nhận, 10 từ chối, 11 chưa có phản hồi. */
export const ContainerListStatusSchema = z.enum(["DRAFT", "SENDING", "ACCEPTED", "REJECTED", "NO_RESPONSE"]);
export type ContainerListStatus = z.infer<typeof ContainerListStatusSchema>;
export const KvgsFetchStatusSchema = ContainerListStatusSchema;
export type KvgsFetchStatus = z.infer<typeof KvgsFetchStatusSchema>;

/** Dùng lại lỗi đã chuẩn hóa của thông điệp Hải quan. */
export const CustomsErrorItemSchema = CustomsErrorSchema;
export type CustomsErrorItem = z.infer<typeof CustomsErrorItemSchema>;

export type ContainerListIssue = {
  /** 1-based; 0 = lỗi cả bảng (bảng rỗng). */
  row: number;
  field: "billNo" | "containerNo" | "sealNo" | "note";
  code: "REQUIRED" | "INVALID_CONTAINER_NO" | "DUPLICATE" | "TOO_LONG";
};

const LIMITS = { billNo: 35, containerNo: 50, sealNo: 50, note: 255 } as const;

/** Kiểm bảng trước khi lưu/gửi; số container chuẩn hóa trước khi kiểm ISO 6346 và trùng. */
export function checkContainerList(rows: ContainerListRow[]): ContainerListIssue[] {
  if (rows.length === 0) return [{ row: 0, field: "containerNo", code: "REQUIRED" }];
  const issues: ContainerListIssue[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const row = i + 1;
    for (const field of ["billNo", "containerNo", "sealNo", "note"] as const) {
      const v = field === "containerNo" ? normalizeContainerNo(r[field]) : r[field].trim();
      if (field !== "note" && v === "") issues.push({ row, field, code: "REQUIRED" });
      else if (v.length > LIMITS[field]) issues.push({ row, field, code: "TOO_LONG" });
      else if (field === "containerNo") {
        if (!isValidContainerNo(v)) issues.push({ row, field, code: "INVALID_CONTAINER_NO" });
        else if (seen.has(v)) issues.push({ row, field, code: "DUPLICATE" });
        seen.add(v);
      }
    }
  });
  return issues;
}

export const SaveContainerListInputSchema = z.object({ rows: z.array(ContainerListRowSchema) });
export type SaveContainerListInput = z.infer<typeof SaveContainerListInputSchema>;

/** Ảnh mã vạch Base64 thuần (không tiền tố data:) – API KVGS `bangKeMaVachContainer[].barcodeImage`. Tối đa 200 KB ký tự. */
export const PLAIN_BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
export const BARCODE_IMAGE_MAX_LENGTH = 200 * 1024;
export const isPlainBase64 = (v: string): boolean => v.length <= BARCODE_IMAGE_MAX_LENGTH && PLAIN_BASE64_RE.test(v);
export const BarcodeImageSchema = z.string().max(BARCODE_IMAGE_MAX_LENGTH).regex(PLAIN_BASE64_RE);

/** Bảng kê qua khu vực giám sát đã chuẩn hóa (spec §2.4). Số lượng/trọng lượng là chuỗi thập phân. */
export const KvgsSheetSchema = z.object({
  kind: z.enum(["CONTAINER", "CARGO"]),
  regionOffice: z.string(),
  customsOffice: z.string(),
  supervisionOffice: z.string(),
  sealRequired: z.boolean(),
  companyName: z.string(),
  taxCode: z.string(),
  declarationNo: z.string(),
  declarationStatus: z.string(),
  declarationDate: IsoDateSchema,
  declarationDateTo: IsoDateSchema.nullable(),
  typeName: z.string(),
  channel: z.string(),
  cargoControlNo: z.string(),
  /** CARGO: số tờ khai (in Code128); CONTAINER: null (mã vạch theo từng container). */
  barcode: z.string().nullable(),
  /** CONTAINER: ảnh mã vạch từng container do Hải quan cấp (PNG Base64). CARGO: rỗng. */
  containers: z.array(z.object({ containerNo: z.string(), sealNo: z.string().nullable(), customsSealNo: z.string().nullable(), barcodeImage: BarcodeImageSchema.nullable() })),
  cargo: z.object({ quantity: z.string(), quantityUnit: z.string(), grossWeight: z.string(), weightUnit: z.string() }).nullable(),
  exportedAt: IsoDateTimeSchema,
});
export type KvgsSheet = z.infer<typeof KvgsSheetSchema>;

export const KvgsViewSchema = z.object({
  dossierId: z.string(),
  branch: z.number().int().positive(),
  applies: z.object({ containerList: z.boolean(), kvgs: z.boolean() }),
  containerList: z
    .object({
      attempt: z.number().int().positive(),
      status: ContainerListStatusSchema,
      rows: z.array(ContainerListRowSchema),
      refId: z.string().nullable(),
      receiptNo: z.string().nullable(),
      receiptDate: z.string().nullable(),
      errors: z.array(CustomsErrorItemSchema),
      sentAt: IsoDateTimeSchema.nullable(),
    })
    .nullable(),
  kvgs: z
    .object({
      status: KvgsFetchStatusSchema,
      refId: z.string().nullable(),
      receiptNo: z.string().nullable(),
      receiptDate: z.string().nullable(),
      errors: z.array(CustomsErrorItemSchema),
      fetchedAt: IsoDateTimeSchema.nullable(),
      sheet: KvgsSheetSchema.nullable(),
    })
    .nullable(),
  header: z.object({
    declarationNo: z.string().nullable(),
    typeCode: z.string().nullable(),
    customsOffice: z.string().nullable(),
    registeredOn: IsoDateSchema.nullable(),
    companyName: z.string(),
  }),
});
export type KvgsView = z.infer<typeof KvgsViewSchema>;
