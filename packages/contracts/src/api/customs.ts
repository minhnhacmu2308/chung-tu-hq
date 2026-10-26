import { z } from "zod";
import { CustomsChannelSchema, DecimalStringSchema, DirectionSchema, IsoDateTimeSchema } from "../common.js";
import { CustomsActionSchema, CustomsPhaseSchema, CustomsStageSchema } from "../customs-flow.js";
import { ReasonCodeSchema, ReasonParamsSchema } from "../reason-codes.js";
import { CustomsInfoSchema, CustomsRejectionSchema, CustomsMessageSchema, CustomsOperationSchema, CustomsResultSchema } from "../dto/customs.js";
import { DeclarationStatusSchema } from "../dto/declaration.js";
import { CustomsSummarySchema } from "../dto/dossier.js";

/** Trạng thái truyền của một tờ khai (ADR 0005): lỗi gửi giữ bước, chỉ bước kế tiếp mới tiến. */
export const SubmissionStateSchema = z.enum(["APPROVED", "PRE_DECLARED", "DECLARED", "DOCS_SENT", "CLEARED", "INSPECTION", "REJECTED", "SEND_FAILED"]);
export type SubmissionState = z.infer<typeof SubmissionStateSchema>;

export const SubmitDeclarationInputSchema = z.object({
  certificateId: z.string().min(1, "Chọn chứng thư số để ký"),
  /** Xác nhận vẫn khai dù hệ thống gợi ý cần HYS (khai bỏ qua gợi ý). */
  hysWaived: z.boolean().optional(),
});
/** Tờ khai nhánh (lô > 50 dòng tách nhiều tờ – spec tách tờ khai §7): số nguyên ≥ 1, vắng = tờ 1. Ép từ chuỗi để dùng cho query `?branch=`. */
export const BranchParamSchema = z.coerce.number().int().min(1).default(1);
/** Thân / query chỉ mang `branch` (bắt đầu sửa sau thông quan, xem / duyệt / bỏ dòng AMA). */
export const BranchQuerySchema = z.object({ branch: BranchParamSchema });
export type BranchQuery = z.infer<typeof BranchQuerySchema>;
export const ResendOperationInputSchema = z.object({ operation: CustomsOperationSchema, branch: BranchParamSchema });
/** Thực hiện một nghiệp vụ trên tờ khai đã truyền (IDB, IDC, IDD, IDA01, IDE, AMA, AMB, AMC, HYS, CONT, PORT_FEE, IID/IEX, khai tạm lại IDA) – trên tờ `branch`. */
export const PerformOperationInputSchema = z.object({ operation: CustomsOperationSchema, branch: BranchParamSchema, hysWaived: z.boolean().optional() });

export const PipelineStatusSchema = z.enum(["NOT_SENT", "WAITING", "SENDING", "OK", "ERROR"]);
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export const PipelineRowSchema = z.object({
  op: CustomsOperationSchema, label: z.string(), status: PipelineStatusSchema, at: IsoDateTimeSchema.optional(), summary: z.string().optional(),
  /** Nhóm trên màn (null = tra cứu, hiện ở đầu trang). */
  phase: CustomsPhaseSchema.nullable().default(null),
  /** Bấm được ở giai đoạn hiện tại. */
  enabled: z.boolean().default(false),
  action: CustomsActionSchema.default("SEND"),
  /** Lý do bị khóa / hướng dẫn khi phải sửa tờ khai trước (câu tiếng Việt – giữ cho tương thích ngược). */
  reason: z.string().optional(),
  /** Mã lý do ổn định (reason-codes.ts) + tham số – giao diện dịch theo ngôn ngữ, mã lạ thì hiện `reason`. */
  reasonCode: ReasonCodeSchema.optional(),
  reasonParams: ReasonParamsSchema.optional(),
});
export type PipelineRow = z.infer<typeof PipelineRowSchema>;

/** Trạng thái truyền của một tờ khai nhánh: vòng đời riêng (số tờ khai, phân luồng, thông quan, nghiệp vụ, AMA). */
export const BranchSubmissionSchema = z.object({
  /** Tờ thứ mấy (từ 1) / tổng số tờ của lô. */
  no: z.number().int().min(1),
  of: z.number().int().min(1),
  stage: CustomsStageSchema,
  state: SubmissionStateSchema.default("APPROVED"),
  declarationNo: z.string().nullable(),
  channel: CustomsChannelSchema.nullable().default(null),
  pipeline: z.array(PipelineRowSchema),
  nextOp: CustomsOperationSchema.nullable(),
  queryOp: CustomsOperationSchema,
  amendments: z.number().int().nonnegative(),
  postAmendments: z.number().int().nonnegative(),
  /** Thông điệp của tờ, mới nhất trước. */
  messages: z.array(CustomsMessageSchema),
  result: CustomsResultSchema.partial().nullable(),
  customsInfo: CustomsInfoSchema.nullable(),
  rejection: CustomsRejectionSchema.nullable(),
  /** Đang chờ gửi / phản hồi / hỏi trạng thái của tờ. */
  inProgress: z.boolean(),
  /** Tờ đã từng gửi (outbox hoặc thông điệp gửi đi) – lỗi "chưa khai tạm tự động" ghi trên tờ chưa gửi không tính. */
  started: z.boolean(),
  /**
   * Lô nhiều tờ, tờ còn hiệu lực ở Hải quan (chưa gọi về): nội dung hiện tại khác nội dung đã gửi – mã chỉ tiêu chung đã đổi + dòng hàng của tờ có đổi
   * (guard SENT_SHEETS_CHANGED). Không đổi / không áp dụng / tờ gửi trước khi có ảnh chụp → null. JSON cũ không có → null.
   */
  sentChanges: z.object({ common: z.array(z.string()), lines: z.boolean() }).nullable().default(null),
});
export type BranchSubmission = z.infer<typeof BranchSubmissionSchema>;

/** Trường cấp hồ sơ (declarationStatus…rejection) giữ cho tương thích = tờ 1; `branches` mọi tờ theo thứ tự. */
export const SubmissionViewSchema = z.object({
  declarationStatus: DeclarationStatusSchema,
  hsUnconfirmed: z.number().int().nonnegative(),
  started: z.boolean(),
  inProgress: z.boolean(),
  /** Giai đoạn vòng đời tờ khai (xem customs-flow). */
  stage: CustomsStageSchema.default("NOT_SENT"),
  /** Việc tiếp theo nên làm; null khi chỉ còn chờ Hải quan. */
  nextOp: CustomsOperationSchema.nullable().default(null),
  /** Mã nghiệp vụ tra cứu theo chiều tờ khai (IID nhập / IEX xuất). */
  queryOp: CustomsOperationSchema.default("IID"),
  /** Số lần đã sửa đổi bổ sung (IDE) và sửa sau thông quan (AMC) thành công. */
  amendments: z.number().int().nonnegative().default(0),
  postAmendments: z.number().int().nonnegative().default(0),
  /** Mọi nghiệp vụ của luồng (theo thứ tự), kèm trạng thái và khả năng bấm. */
  pipeline: z.array(PipelineRowSchema),
  /** Thông điệp mới nhất trước. */
  messages: z.array(CustomsMessageSchema),
  result: CustomsResultSchema.partial().nullable(),
  /** Thông tin Hải quan trả về (số tờ khai, đăng ký, thuế, tỷ giá, trị giá từng dòng, chỉ thị, cấp phép); null khi chưa có phản hồi. */
  customsInfo: CustomsInfoSchema.nullable().default(null),
  /** Lỗi Hải quan của lần gửi bị từ chối gần nhất – màn Review gắn vào đúng ô chỉ tiêu. */
  rejection: CustomsRejectionSchema.nullable().default(null),
  /** Mọi tờ khai nhánh (lô 1 tờ → 1 phần tử); JSON cũ không có → []. */
  branches: z.array(BranchSubmissionSchema).default([]),
  summary: CustomsSummarySchema.default({ of: 1, cleared: 0, problems: [] }),
});
export type SubmissionView = z.infer<typeof SubmissionViewSchema>;

export const CustomsRowSchema = z.object({
  dossierId: z.string(),
  dossierCode: z.string(),
  /** Tờ khai nhánh của dòng (mỗi tờ một dòng) / tổng số tờ của lô. */
  branch: z.number().int().min(1).default(1),
  of: z.number().int().min(1).default(1),
  direction: DirectionSchema,
  partner: z.string(),
  typeCode: z.string(),
  lastOperation: CustomsOperationSchema.optional(),
  declarationNo: z.string().optional(),
  channel: z.enum(["GREEN", "YELLOW", "RED"]).optional(),
  channelNote: z.string().optional(),
  state: z.enum(["READY", "SENDING", "INSPECTING", "CLEARED"]),
  stage: CustomsStageSchema.optional(),
  customsTaxVnd: DecimalStringSchema.optional(),
  updatedAt: IsoDateTimeSchema,
});
export type CustomsRow = z.infer<typeof CustomsRowSchema>;

export const ResendResultSchema = z.object({ resent: z.boolean(), message: z.string() });
/** Kết quả bấm một nghiệp vụ: đã xếp hàng gửi (sent) hoặc đã trả lời ngay (tra cứu); `message` hiện cho người dùng. */
export const OperationResultSchema = z.object({ sent: z.boolean(), message: z.string() });
export type OperationResult = z.infer<typeof OperationResultSchema>;
/** Gọi về tất cả tờ: như OperationResult + các tờ sẽ gọi về (theo thứ tự gửi nối tiếp). */
export const RecallAllResultSchema = OperationResultSchema.extend({ sheets: z.array(z.number().int().positive()) });
export type RecallAllResult = z.infer<typeof RecallAllResultSchema>;
export type ResendResult = z.infer<typeof ResendResultSchema>;
