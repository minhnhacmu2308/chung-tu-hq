// Input của nhóm API back-office (/api/admin/**). Dùng ở form (zod) và – khi có backend – ở route handler.
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema } from "../common.js";
import { AnnouncementAudienceSchema, AnnouncementKindSchema, isMonday, PlanCodeSchema, StaffRoleSchema } from "../dto/index.js";
import { EmailSchema } from "./identity.js";

/** Mọi thao tác ghi ảnh hưởng tới khách hoặc cấu hình đều kèm lý do – ghi vào nhật ký quản trị. */
export const AdminReasonSchema = z.string().trim().min(5, "Nhập lý do (ít nhất 5 ký tự)").max(500, "Lý do tối đa 500 ký tự");
const withReason = { reason: AdminReasonSchema };

export const AdminLoginInputSchema = z.object({ email: EmailSchema, password: z.string().min(1) });

export const AdminReasonInputSchema = z.object(withReason);
export type AdminReasonInput = z.infer<typeof AdminReasonInputSchema>;

export const ChangeOrgPlanInputSchema = z.object({ planCode: PlanCodeSchema, ...withReason });
export type ChangeOrgPlanInput = z.infer<typeof ChangeOrgPlanInputSchema>;

export const AdjustOrgQuotaInputSchema = z.object({
  bonusDossiers: z.number().int("Nhập số nguyên").min(0, "Không nhỏ hơn 0").max(10_000, "Tối đa 10.000 hồ sơ"),
  ...withReason,
});
export type AdjustOrgQuotaInput = z.infer<typeof AdjustOrgQuotaInputSchema>;

export const ExtendOrgTrialInputSchema = z.object({ days: z.number().int("Nhập số nguyên").min(1, "Ít nhất 1 ngày").max(90, "Tối đa 90 ngày"), ...withReason });
export type ExtendOrgTrialInput = z.infer<typeof ExtendOrgTrialInputSchema>;

export const UpdatePlanInputSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên gói"),
  dossiersPerMonth: z.number().int("Nhập số nguyên").min(1, "Ít nhất 1 hồ sơ"),
  pagesPerDossier: z.number().int("Nhập số nguyên").min(1, "Ít nhất 1 trang"),
  priceVnd: DecimalStringSchema,
  ...withReason,
});
export type UpdatePlanInput = z.infer<typeof UpdatePlanInputSchema>;

export const UpdateIntegrationKeyInputSchema = z.object({ apiKey: z.string().trim().min(8, "Khóa API ít nhất 8 ký tự"), ...withReason });
export type UpdateIntegrationKeyInput = z.infer<typeof UpdateIntegrationKeyInputSchema>;

export const SetTemplatePublishedInputSchema = z.object({ published: z.boolean(), ...withReason });
export type SetTemplatePublishedInput = z.infer<typeof SetTemplatePublishedInputSchema>;

export const InviteStaffInputSchema = z.object({ email: EmailSchema, name: z.string().trim().min(2, "Nhập họ tên"), role: StaffRoleSchema });
export type InviteStaffInput = z.infer<typeof InviteStaffInputSchema>;

export const ChangeStaffRoleInputSchema = z.object({ role: StaffRoleSchema, ...withReason });
export type ChangeStaffRoleInput = z.infer<typeof ChangeStaffRoleInputSchema>;

export const SendAnnouncementInputSchema = z
  .object({
    title: z.string().trim().min(5, "Tiêu đề ít nhất 5 ký tự").max(120, "Tiêu đề tối đa 120 ký tự"),
    body: z.string().trim().min(10, "Nội dung ít nhất 10 ký tự").max(1000, "Nội dung tối đa 1.000 ký tự"),
    kind: AnnouncementKindSchema,
    audience: AnnouncementAudienceSchema,
    maintenanceDate: IsoDateSchema.optional(),
  })
  .refine((v) => v.kind !== "MAINTENANCE" || !!v.maintenanceDate, { path: ["maintenanceDate"], message: "Chọn ngày bảo trì" });
export type SendAnnouncementInput = z.infer<typeof SendAnnouncementInputSchema>;

/** Mã 6 số từ ứng dụng xác thực, hoặc mã khôi phục dạng "abcd-efgh". */
export const AdminMfaCodeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .refine((v) => /^\d{3}\s?\d{3}$/.test(v) || /^[a-z2-9]{4}-[a-z2-9]{4}$/i.test(v), "Nhập mã 6 số trong ứng dụng xác thực hoặc mã khôi phục"),
});
export type AdminMfaCodeInput = z.infer<typeof AdminMfaCodeInputSchema>;

/** Bước thiết lập: khóa (để nhập tay) + URI + mã QR dạng SVG. */
export const AdminMfaSetupSchema = z.object({ secret: z.string(), otpauthUri: z.string(), qrSvg: z.string() });
export type AdminMfaSetup = z.infer<typeof AdminMfaSetupSchema>;

/** Bật xong: mã khôi phục chỉ hiện MỘT lần. */
export const AdminMfaEnabledSchema = z.object({ recoveryCodes: z.array(z.string()) });
export type AdminMfaEnabled = z.infer<typeof AdminMfaEnabledSchema>;

/** Đội vận hành thêm/sửa tỷ giá tính thuế một tuần (thứ Hai hiệu lực) – vd tỷ giá chéo NHNN cho ngoại tệ Vietcombank không công bố. */
export const UpsertExchangeRateInputSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/, "Mã tiền tệ 3 chữ in hoa (USD, TWD…)"),
  effectiveFrom: IsoDateSchema.refine(isMonday, "Ngày hiệu lực phải là thứ Hai"),
  rate: DecimalStringSchema.refine((v) => Number(v) > 0, "Tỷ giá phải lớn hơn 0"),
  ...withReason,
});
export type UpsertExchangeRateInput = z.infer<typeof UpsertExchangeRateInputSchema>;
