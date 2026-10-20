import { z } from "zod";
import { IsoDateTimeSchema } from "../common.js";

/**
 * Bản khai bổ sung sau thông quan (AMA) – bản khai riêng tham chiếu tờ khai gốc (docs/superpowers/specs/2026-10-19-ama-khai-bo-sung-sau-thong-quan-design.md).
 * Giá trị lưu theo tên trường VNACCS (`TK_*` của VN_AMA, `HAG_*` của VN_AMA_HANG); ô riêng của phần mềm dùng tiền tố `APP_`.
 *
 * DRAFT: đang lập · APPROVED: đã duyệt, chờ khai AMA · PRE_DECLARED: đã khai tạm AMA (chỉ xem, muốn sửa thì AMB) ·
 * RECALLED: AMB đã gọi về (sửa, duyệt lại rồi khai AMA lại) · REGISTERED: đã khai chính thức AMC (khóa toàn bộ).
 */
export const PostAmendmentStatusSchema = z.enum(["DRAFT", "APPROVED", "PRE_DECLARED", "RECALLED", "REGISTERED"]);
export type PostAmendmentStatus = z.infer<typeof PostAmendmentStatusSchema>;

export const PostAmendmentValuesSchema = z.record(z.string(), z.string());
export type PostAmendmentValues = z.infer<typeof PostAmendmentValuesSchema>;

export const PostAmendmentLineSchema = z.object({
  id: z.string(),
  /** Số dòng trên tờ khai gốc (HAG_RAN). */
  ran: z.number().int().positive(),
  values: PostAmendmentValuesSchema,
  /** Ô tiền/trị giá "Sau" người khai sửa tay – không tự tính đè. */
  manual: z.array(z.string()),
});
export type PostAmendmentLine = z.infer<typeof PostAmendmentLineSchema>;

export const PostAmendmentSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  /** Lần khai bổ sung thứ mấy của hồ sơ (1, 2…). */
  seq: z.number().int().positive(),
  status: PostAmendmentStatusSchema,
  header: PostAmendmentValuesSchema,
  lines: z.array(PostAmendmentLineSchema),
  approvedBy: z.string().optional(),
  approvedAt: IsoDateTimeSchema.optional(),
  /** Hải quan trả về (VN_AMA phần phản hồi): TK_SYN, TK_ADD, TK_A02, TK_ADE, TK_A23… */
  result: PostAmendmentValuesSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type PostAmendment = z.infer<typeof PostAmendmentSchema>;

/** Dòng của tờ khai gốc chọn được để đưa vào bản khai bổ sung. */
export const PostAmendmentSourceLineSchema = z.object({ lineNo: z.number().int().positive(), description: z.string(), hsCode: z.string() });
export type PostAmendmentSourceLine = z.infer<typeof PostAmendmentSourceLineSchema>;

/** Hợp đồng gia công để chèn vào ghi chú sau khai bổ sung. */
export const ProcessingContractSchema = z.object({ no: z.string(), date: z.string() });
export type ProcessingContract = z.infer<typeof ProcessingContractSchema>;

export const PostAmendmentViewSchema = z.object({
  /** Bản đang mở (chưa AMC); null khi chưa lập. */
  current: PostAmendmentSchema.nullable(),
  /** Các bản đã khai chính thức (AMC), mới nhất trước. */
  history: z.array(PostAmendmentSchema),
  sourceLines: z.array(PostAmendmentSourceLineSchema),
  contracts: z.array(ProcessingContractSchema),
});
export type PostAmendmentView = z.infer<typeof PostAmendmentViewSchema>;

/** Sửa một ô: `lineId` có → ô dòng hàng. Ô tiền "Sau" để trống → bỏ sửa tay, tự tính lại. */
export const UpdatePostAmendmentFieldSchema = z.object({ lineId: z.string().optional(), key: z.string().min(1), value: z.string().max(2000) });
export type UpdatePostAmendmentField = z.infer<typeof UpdatePostAmendmentFieldSchema>;
/** Thêm một hoặc nhiều dòng của tờ khai gốc (chọn nhiều dòng cùng lúc). */
export const AddPostAmendmentLinesSchema = z.object({ lineNos: z.array(z.number().int().positive()).min(1).max(999) });
