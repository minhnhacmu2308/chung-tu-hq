import { z } from "zod";
import { DecimalStringSchema, IsoDateTimeSchema } from "../common.js";
import { AgentModeSchema, AgentRunSchema, AgentTaskIdSchema, DeclarationSchema, LineItemSchema } from "../dto/declaration.js";

export const StartAgentRunInputSchema = z.object({ mode: AgentModeSchema });
export const ConfirmHsInputSchema = z.object({ code: z.string().trim().regex(/^\d{4}\.\d{2}\.\d{2}$/, "Mã HS 8 số dạng 8482.10.00") });
export const UpdateDeclarationFieldInputSchema = z.object({ value: z.string().trim().max(500) });
export const HsCatalogQuerySchema = z.object({ q: z.string().trim().max(100).optional() });

export const AgentLogLineSchema = z.object({ at: IsoDateTimeSchema, text: z.string(), tone: z.enum(["info", "success", "warning"]) });
export type AgentLogLine = z.infer<typeof AgentLogLineSchema>;

/** Tiến trình agent cho màn hình: run + nhật ký + việc đang chạy. */
export const AgentRunViewSchema = z.object({ run: AgentRunSchema, logs: z.array(AgentLogLineSchema), finished: z.boolean(), current: AgentTaskIdSchema.optional() });
export type AgentRunView = z.infer<typeof AgentRunViewSchema>;

/** Biểu thuế tối thiểu (D1): thuế NK MFN, ưu đãi đặc biệt theo mẫu C/O, VAT, chính sách. */
export const HsEntrySchema = z.object({
  code: z.string(),
  description: z.string(),
  mfn: DecimalStringSchema,
  pref: z.record(z.string(), DecimalStringSchema).optional(),
  vat: DecimalStringSchema,
  policy: z.string().optional(),
});
export type HsEntry = z.infer<typeof HsEntrySchema>;

export const DeclarationItemViewSchema = LineItemSchema.extend({ customsValueVnd: DecimalStringSchema, importDutyVnd: DecimalStringSchema, vatVnd: DecimalStringSchema });
export type DeclarationItemView = z.infer<typeof DeclarationItemViewSchema>;

export const DeclarationViewSchema = z.object({ declaration: DeclarationSchema.nullable(), items: z.array(DeclarationItemViewSchema), unconfirmedHs: z.number().int().nonnegative() });
export type DeclarationView = z.infer<typeof DeclarationViewSchema>;
