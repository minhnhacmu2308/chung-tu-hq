import { z } from "zod";
import { DecimalStringSchema, DirectionSchema, IsoDateTimeSchema } from "../common.js";
import { CustomsMessageSchema, CustomsOperationSchema, CustomsResultSchema } from "../dto/customs.js";
import { DeclarationStatusSchema } from "../dto/declaration.js";

/** Trạng thái truyền của một tờ khai (ADR 0005): lỗi gửi giữ bước, chỉ bước kế tiếp mới tiến. */
export const SubmissionStateSchema = z.enum(["APPROVED", "PRE_DECLARED", "DECLARED", "DOCS_SENT", "CLEARED", "INSPECTION", "REJECTED", "SEND_FAILED"]);
export type SubmissionState = z.infer<typeof SubmissionStateSchema>;

export const SubmitDeclarationInputSchema = z.object({ certificateId: z.string().min(1, "Chọn chứng thư số để ký") });
export const ResendOperationInputSchema = z.object({ operation: CustomsOperationSchema });

export const PipelineStatusSchema = z.enum(["NOT_SENT", "WAITING", "SENDING", "OK", "ERROR"]);
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export const PipelineRowSchema = z.object({ op: CustomsOperationSchema, label: z.string(), status: PipelineStatusSchema, at: IsoDateTimeSchema.optional(), summary: z.string().optional() });
export type PipelineRow = z.infer<typeof PipelineRowSchema>;

export const SubmissionViewSchema = z.object({
  declarationStatus: DeclarationStatusSchema,
  hsUnconfirmed: z.number().int().nonnegative(),
  started: z.boolean(),
  inProgress: z.boolean(),
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
  customsTaxVnd: DecimalStringSchema.optional(),
  updatedAt: IsoDateTimeSchema,
});
export type CustomsRow = z.infer<typeof CustomsRowSchema>;

export const ResendResultSchema = z.object({ resent: z.boolean(), message: z.string() });
export type ResendResult = z.infer<typeof ResendResultSchema>;
