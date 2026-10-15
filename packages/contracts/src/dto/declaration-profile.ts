import { z } from "zod";
import { IsoDateTimeSchema } from "../common.js";

/**
 * Mặc định khai báo của doanh nghiệp (Cài đặt → Khai báo): giá trị dùng khi chứng từ không có,
 * và ghi đè nguồn từng chỉ tiêu trong phạm vi quy tắc cho phép (spec 2026-10-15 §5.2, §6.3).
 */
export const PROFILE_FIELD_CODES = ["MA_LH", "CQHQ", "PTVC", "KHO", "PT_TT", "KHAI_TG", "NGUOI_NT", "PL_CN", "HD_PL", "GIA_PL"] as const;
export type ProfileFieldCode = (typeof PROFILE_FIELD_CODES)[number];

export const DeclarationDirectionSchema = z.enum(["NK", "XK"]);
export type DeclarationDirection = z.infer<typeof DeclarationDirectionSchema>;

export const FieldOverrideSchema = z.union([
  z.object({ sources: z.array(z.string().min(1)).min(1).max(10) }).strict(),
  z.object({ fixed: z.string().trim().min(1).max(255) }).strict(),
]);
export type FieldOverride = z.infer<typeof FieldOverrideSchema>;

export const DeclarationProfileInputSchema = z.object({
  values: z.record(z.string(), z.string().trim().max(255)),
  overrides: z.record(z.string(), FieldOverrideSchema),
});
export type DeclarationProfileInput = z.infer<typeof DeclarationProfileInputSchema>;

export const DeclarationProfileSchema = DeclarationProfileInputSchema.extend({
  direction: DeclarationDirectionSchema,
  updatedAt: IsoDateTimeSchema.nullable(),
});
export type DeclarationProfile = z.infer<typeof DeclarationProfileSchema>;

/** Phạm vi cấu hình của một chỉ tiêu (màn Cài đặt → Khai báo). `locked` = chỉ tiêu trị giá/thuế hoặc không cho đổi nguồn. */
export const RuleOptionViewSchema = z.object({
  code: z.string(),
  no: z.string().nullable(),
  label: z.string(),
  required: z.boolean(),
  sources: z.array(z.object({ id: z.string(), label: z.string() })),
  allowFixed: z.boolean(),
  locked: z.boolean(),
});
export type RuleOptionView = z.infer<typeof RuleOptionViewSchema>;
