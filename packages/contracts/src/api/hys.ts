import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema } from "../common.js";
import { ATTACH_KIND_CODES } from "../declaration/code-tables.js";
import { HYS_PROCEDURE_CODES, type HysProcedureCode } from "../fpt/hys.js";
import type { HysIssue, HysSuggestion } from "../hys/rules.js";

/** DTO API cho nghiệp vụ HYS (hồ sơ đính kèm điện tử) – gửi trước IDA/EDA, số tiếp nhận điền vào cặp 1.63/2.53. */

export const HysStatusSchema = z.enum(["DRAFT", "SENDING", "ACCEPTED", "REJECTED", "SEND_FAILED"]);
export type HysStatus = z.infer<typeof HysStatusSchema>;

/** Phân loại đính kèm 1.63/2.53 ô 1 (TK_EA) – bảng ATTACH_KIND, khác mã thủ tục A546 (TK_TSB). */
export const AttachKindSchema = z.enum(ATTACH_KIND_CODES);

export const AttachmentSlotSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const HysFillSchema = z.object({
  outcome: z.enum(["FILLED", "ALREADY", "FULL", "REPLACED", "LOCKED", "NO_RECEIPT"]),
  slot: AttachmentSlotSchema.optional(),
  afterApproval: z.boolean().optional(),
  /** REPLACED: cặp cũ (phân loại đính kèm / số tiếp nhận) bị thay bằng số mới. */
  replaced: z.object({ code: z.string(), receipt: z.string() }).optional(),
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
  code: z.enum(["NO_FILE", "BAD_EXTENSION", "TOO_LARGE", "MISSING_PROCEDURE", "MISSING_OFFICE", "TOO_LONG"]),
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
  /** Phân loại đính kèm sẽ điền vào TK_EA (null = chưa chọn – lúc gửi dùng đề xuất theo chứng từ đã chọn). */
  attachKind: AttachKindSchema.nullable(),
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
  /** Các cặp 1.63/2.53 đang có số tiếp nhận trên tờ khai hiện hành (theo thứ tự cặp). */
  attachmentSlots: z.array(z.object({ slot: AttachmentSlotSchema, code: z.string(), receipt: z.string() })),
  defaults: z.object({
    customsOffice: z.string().nullable(),
    processingUnit: z.string().nullable(),
    internalRef: z.string(),
  }),
});
export type HysOverview = z.infer<typeof HysOverviewSchema>;

export const CreateHysInputSchema = z.object({ procedureCode: z.string().length(3).optional(), attachKind: AttachKindSchema.optional() });
export type CreateHysInput = z.infer<typeof CreateHysInputSchema>;

export const UpdateHysInputSchema = z.object({
  procedureCode: z.string().length(3).optional(),
  /** null = bỏ chọn, quay về đề xuất theo chứng từ. */
  attachKind: AttachKindSchema.nullable().optional(),
  customsOffice: z.string().optional(),
  processingUnit: z.string().optional(),
  phone: z.string().optional(),
  internalRef: z.string().optional(),
  note: z.string().nullable().optional(),
  documentIds: z.array(z.string()).optional(),
});
export type UpdateHysInput = z.infer<typeof UpdateHysInputSchema>;

export const SendHysInputSchema = z.object({
  certificateId: z.string().min(1),
  /** Cặp 1.63/2.53 sẽ bị thay khi đã đủ 3 cặp có số (bắt buộc trong trường hợp đó, lô còn sửa được). */
  replaceSlot: AttachmentSlotSchema.optional(),
});
export type SendHysInput = z.infer<typeof SendHysInputSchema>;
