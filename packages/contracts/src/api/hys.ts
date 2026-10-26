import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema } from "../common.js";
import { HYS_PROCEDURE_CODES, type HysProcedureCode } from "../fpt/hys.js";
import type { HysIssue, HysSuggestion } from "../hys/rules.js";

/** DTO API cho nghiệp vụ HYS (hồ sơ đính kèm điện tử) – gửi trước IDA/EDA, số tiếp nhận điền vào cặp 1.63/2.53. */

export const HysStatusSchema = z.enum(["DRAFT", "SENDING", "ACCEPTED", "REJECTED", "SEND_FAILED"]);
export type HysStatus = z.infer<typeof HysStatusSchema>;

export const HysFillSchema = z.object({
  outcome: z.enum(["FILLED", "ALREADY", "FULL", "LOCKED", "NO_RECEIPT"]),
  slot: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  afterApproval: z.boolean().optional(),
});
export type HysFill = z.infer<typeof HysFillSchema>;

export const HysFileViewSchema = z.object({
  id: z.string(),
  documentId: z.string().nullable(),
  fileName: z.string(),
  mime: z.string(),
  sizeBytes: z.number(),
  source: z.enum(["DOSSIER", "UPLOAD"]),
});
export type HysFileView = z.infer<typeof HysFileViewSchema>;

export const HysIssueSchema: z.ZodType<HysIssue> = z.object({
  code: z.enum(["NO_FILE", "BAD_EXTENSION", "TOO_LARGE", "MISSING_PROCEDURE", "MISSING_OFFICE", "MISSING_UNIT", "TOO_LONG"]),
  file: z.string().exactOptional(),
  field: z.string().exactOptional(),
  bytes: z.number().exactOptional(),
});

const HysProcedureCodeSchema = z.enum(Object.keys(HYS_PROCEDURE_CODES) as [HysProcedureCode, ...HysProcedureCode[]]);

export const HysSuggestionSchema: z.ZodType<HysSuggestion> = z.object({
  code: HysProcedureCodeSchema,
  rule: z.enum(["G1", "G2", "G3", "G4", "G5"]),
  fieldNo: z.string(),
});

export const HysSubmissionViewSchema = z.object({
  id: z.string(),
  seq: z.number(),
  procedureCode: z.string().nullable(),
  customsOffice: z.string().nullable(),
  processingUnit: z.string().nullable(),
  phone: z.string(),
  internalRef: z.string(),
  note: z.string().nullable(),
  purpose: z.enum(["PRE_DECLARATION", "SUPPLEMENT"]).nullable(),
  status: HysStatusSchema,
  attempt: z.number(),
  receiptNo: z.string().nullable(),
  registeredOn: IsoDateSchema.nullable(),
  reject: z.array(z.object({ code: z.string(), message: z.string(), solution: z.string().optional() })).nullable(),
  fill: HysFillSchema.nullable(),
  files: z.array(HysFileViewSchema),
  issues: z.array(HysIssueSchema),
  sentAt: IsoDateTimeSchema.nullable(),
});
export type HysSubmissionView = z.infer<typeof HysSubmissionViewSchema>;

export const HysOverviewSchema = z.object({
  submissions: z.array(HysSubmissionViewSchema),
  suggestions: z.array(HysSuggestionSchema),
  /** Lô còn sửa được (chưa khai tạm/chính thức) – quyết định điền cặp 1.63/2.53 tự động hay chỉ ghi nhận. */
  lotEditable: z.boolean(),
  /** Gợi ý khai HYS bổ sung (đã có tờ khai nhưng thiếu hồ sơ). */
  supplementHint: z.boolean(),
  defaults: z.object({
    customsOffice: z.string().nullable(),
    processingUnit: z.string().nullable(),
    internalRef: z.string(),
  }),
});
export type HysOverview = z.infer<typeof HysOverviewSchema>;

export const CreateHysInputSchema = z.object({ procedureCode: z.string().length(3).optional() });
export type CreateHysInput = z.infer<typeof CreateHysInputSchema>;

export const UpdateHysInputSchema = z.object({
  procedureCode: z.string().length(3).optional(),
  customsOffice: z.string().optional(),
  processingUnit: z.string().optional(),
  phone: z.string().optional(),
  internalRef: z.string().optional(),
  note: z.string().nullable().optional(),
  documentIds: z.array(z.string()).optional(),
});
export type UpdateHysInput = z.infer<typeof UpdateHysInputSchema>;

export const SendHysInputSchema = z.object({ certificateId: z.string().min(1) });
export type SendHysInput = z.infer<typeof SendHysInputSchema>;
