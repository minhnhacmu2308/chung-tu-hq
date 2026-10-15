import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema, RoleSchema } from "../common.js";

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: RoleSchema,
  status: z.enum(["ACTIVE", "INVITED", "DISABLED"]),
  lastActiveAt: IsoDateTimeSchema.optional(),
});
export type Member = z.infer<typeof MemberSchema>;

/** TRIAL: gói dùng thử khi tạo doanh nghiệp mới (ADR 0004). */
export const PlanCodeSchema = z.enum(["TRIAL", "BASIC", "PRO", "ENTERPRISE"]);
export type PlanCode = z.infer<typeof PlanCodeSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** MST – string. */
  taxCode: z.string(),
  address: z.string(),
  phone: z.string(),
  plan: z.object({
    code: PlanCodeSchema,
    name: z.string(),
    dossiersPerMonth: z.number().int().nonnegative(),
    pagesPerDossier: z.number().int().nonnegative(),
    renewsAt: IsoDateSchema,
  }),
  usage: z.object({ dossiersThisMonth: z.number().int().nonnegative(), pagesThisMonth: z.number().int().nonnegative(), aiCostVnd: DecimalStringSchema }),
  suspectThreshold: z.enum(["STRICT", "BALANCED", "RELAXED"]),
  /** Nguyên tắc 4 mắt: người duyệt tờ khai phải khác người tạo hồ sơ (Chủ sở hữu được miễn). */
  fourEyes: z.boolean(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const IntegrationIdSchema = z.enum(["HSCODEPRO", "CUSTOMS_HUB", "AI_PROVIDER", "EINVOICE"]);
export type IntegrationId = z.infer<typeof IntegrationIdSchema>;
export const IntegrationSchema = z.object({
  id: IntegrationIdSchema,
  name: z.string(),
  description: z.string(),
  status: z.enum(["CONNECTED", "ERROR", "NOT_CONFIGURED"]),
  lastCheckedAt: IsoDateTimeSchema.optional(),
  detail: z.string().optional(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

/**
 * Tài khoản VNACCS của doanh nghiệp (gửi kèm mọi nghiệp vụ FPT trong `objVNACCS_ACCOUNT`).
 * Lưu mã hóa ở `org_secrets` (kind VNACCS). Mật khẩu và terminal access key không bao giờ trả về.
 * Độ dài theo đặc tả FPT: Text 50.
 */
export const VnaccsAccountInputSchema = z.object({
  userId: z.string().trim().min(1, "Nhập User ID VNACCS").max(50, "Tối đa 50 ký tự"),
  password: z.string().min(1, "Nhập mật khẩu VNACCS").max(50, "Tối đa 50 ký tự"),
  terminalId: z.string().trim().min(1, "Nhập Terminal ID").max(50, "Tối đa 50 ký tự"),
  terminalAccessKey: z.string().trim().min(1, "Nhập Terminal Access Key").max(50, "Tối đa 50 ký tự"),
});
export type VnaccsAccountInput = z.infer<typeof VnaccsAccountInputSchema>;

export const VnaccsAccountSchema = z.object({
  configured: z.boolean(),
  userId: z.string().nullable(),
  terminalId: z.string().nullable(),
  updatedAt: IsoDateTimeSchema.nullable(),
});
export type VnaccsAccount = z.infer<typeof VnaccsAccountSchema>;
