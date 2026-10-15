import { z } from "zod";
import { DecimalStringSchema, DirectionSchema, IsoDateTimeSchema } from "../common.js";
import { CustomsActionSchema, CustomsPhaseSchema, CustomsStageSchema } from "../customs-flow.js";
import { CustomsMessageSchema, CustomsOperationSchema, CustomsResultSchema } from "../dto/customs.js";
import { DeclarationStatusSchema } from "../dto/declaration.js";

/** Trạng thái truyền của một tờ khai (ADR 0005): lỗi gửi giữ bước, chỉ bước kế tiếp mới tiến. */
export const SubmissionStateSchema = z.enum(["APPROVED", "PRE_DECLARED", "DECLARED", "DOCS_SENT", "CLEARED", "INSPECTION", "REJECTED", "SEND_FAILED"]);
export type SubmissionState = z.infer<typeof SubmissionStateSchema>;

export const SubmitDeclarationInputSchema = z.object({ certificateId: z.string().min(1, "Chọn chứng thư số để ký") });
export const ResendOperationInputSchema = z.object({ operation: CustomsOperationSchema });
/** Thực hiện một nghiệp vụ trên tờ khai đã truyền (IDB, IDC, IDD, IDA01, IDE, AMA, AMB, AMC, HYS, CONT, PORT_FEE, IID/IEX, khai tạm lại IDA). */
export const PerformOperationInputSchema = z.object({ operation: CustomsOperationSchema });

export const PipelineStatusSchema = z.enum(["NOT_SENT", "WAITING", "SENDING", "OK", "ERROR"]);
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export const PipelineRowSchema = z.object({
  op: CustomsOperationSchema, label: z.string(), status: PipelineStatusSchema, at: IsoDateTimeSchema.optional(), summary: z.string().optional(),
  /** Nhóm trên màn (null = tra cứu, hiện ở đầu trang). */
  phase: CustomsPhaseSchema.nullable().default(null),
  /** Bấm được ở giai đoạn hiện tại. */
  enabled: z.boolean().default(false),
  action: CustomsActionSchema.default("SEND"),
  /** Lý do bị khóa / hướng dẫn khi phải sửa tờ khai trước. */
  reason: z.string().optional(),
});
export type PipelineRow = z.infer<typeof PipelineRowSchema>;

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
});
export type SubmissionView = z.infer<typeof SubmissionViewSchema>;

export const CustomsRowSchema = z.object({
  dossierId: z.string(),
  dossierCode: z.string(),
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
export type ResendResult = z.infer<typeof ResendResultSchema>;
