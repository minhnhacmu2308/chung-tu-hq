import { z } from "zod";
import { IsoDateTimeSchema, RoleSchema } from "../common.js";
import { OrgBillingSchema, OrgPlanSchema } from "./billing.js";

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: RoleSchema,
  status: z.enum(["ACTIVE", "INVITED", "DISABLED"]),
  lastActiveAt: IsoDateTimeSchema.optional(),
});
export type Member = z.infer<typeof MemberSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** MST – string. */
  taxCode: z.string(),
  address: z.string(),
  phone: z.string(),
  /** Mã bưu chính (6 số) – điền chỉ tiêu 1.14 IDA / 2.13 EDA. Thiếu hoặc "" = chưa khai. */
  postalCode: z.string().optional(),
  /** Gói (ADR 0011): PAYG theo lượt hoặc CONTRACT hợp đồng năm. */
  plan: OrgPlanSchema,
  /** Lượt / hợp đồng (module billing cung cấp). */
  billing: OrgBillingSchema,
  /**
   * Mức dùng tháng hiện tại (giờ VN). Giá vốn AI/HSCodePro/Customs Hub là số nội bộ – chỉ khu Quản trị xem, không trả cho khách.
   */
  usage: z.object({
    dossiersThisMonth: z.number().int().nonnegative(),
    pagesThisMonth: z.number().int().nonnegative(),
  }),
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
