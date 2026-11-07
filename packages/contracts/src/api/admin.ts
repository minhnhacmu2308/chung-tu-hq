// Input của nhóm API back-office (/api/admin/**). Dùng ở form (zod) và – khi có backend – ở route handler.
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema } from "../common.js";
import { AnnouncementAudienceSchema, AnnouncementKindSchema, isMonday, PlanCodeSchema, StaffRoleSchema } from "../dto/index.js";
import { EmailSchema, TaxCodeSchema } from "./identity.js";

/** Mọi thao tác ghi ảnh hưởng tới khách hoặc cấu hình đều kèm lý do – ghi vào nhật ký quản trị. */
export const AdminReasonSchema = z.string().trim().min(5, "Nhập lý do (ít nhất 5 ký tự)").max(500, "Lý do tối đa 500 ký tự");
const withReason = { reason: AdminReasonSchema };

export const AdminLoginInputSchema = z.object({ email: EmailSchema, password: z.string().min(1) });

export const AdminReasonInputSchema = z.object(withReason);
export type AdminReasonInput = z.infer<typeof AdminReasonInputSchema>;

export const ChangeOrgPlanInputSchema = z.object({ planCode: PlanCodeSchema, ...withReason });
export type ChangeOrgPlanInput = z.infer<typeof ChangeOrgPlanInputSchema>;

/** Tiền VND không âm (giá trị hợp đồng, giá gói) – chuỗi thập phân. */
const VndSchema = DecimalStringSchema.refine((v) => !v.startsWith("-"), "Không nhỏ hơn 0");

/**
 * Hợp đồng năm (gói CONTRACT): số hợp đồng, hiệu lực từ–đến, giá trị (báo cáo doanh thu = giá trị/12 mỗi tháng hợp đồng phủ), ghi chú nội bộ.
 * Chưa có ngày kết thúc → khai không giới hạn (khu Quản trị nhắc CONTRACT_NO_END).
 */
const contractFields = {
  contractNo: z.string().trim().max(100).optional(),
  startsOn: IsoDateSchema.optional(),
  endsOn: IsoDateSchema.optional(),
  valueVnd: VndSchema.optional(),
  note: z.string().trim().max(2000).optional(),
};
const contractRangeOk = (v: { startsOn?: string | undefined; endsOn?: string | undefined }) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn;

/**
 * Quản trị tạo hộ doanh nghiệp + tài khoản Chủ sở hữu (mật khẩu tạm, bắt đổi ở lần đăng nhập đầu).
 * PAYG: tùy chọn tặng `grantCredits` lượt. CONTRACT: kèm hợp đồng (số, bắt đầu, kết thúc, giá trị).
 */
export const CreateOrgInputSchema = z
  .object({
    taxCode: TaxCodeSchema,
    name: z.string().trim().min(1, "Nhập tên doanh nghiệp").max(300),
    address: z.string().trim().max(500),
    planCode: PlanCodeSchema,
    grantCredits: z.number().int("Nhập số nguyên").min(0, "Không nhỏ hơn 0").max(10_000, "Tối đa 10.000 lượt").optional(),
    ...contractFields,
    owner: z.object({ email: EmailSchema, name: z.string().trim().min(2, "Nhập họ tên").max(200) }),
  })
  .refine(contractRangeOk, { path: ["endsOn"], message: "Ngày kết thúc phải sau ngày bắt đầu" });
export type CreateOrgInput = z.infer<typeof CreateOrgInputSchema>;
/** Mật khẩu tạm chỉ trả về MỘT lần, lúc tạo – không lưu dạng đọc được ở đâu cả. */
export const CreateOrgResultSchema = z.object({ orgId: z.string(), orgName: z.string(), ownerEmail: z.string(), tempPassword: z.string() });
export type CreateOrgResult = z.infer<typeof CreateOrgResultSchema>;

/** PUT /api/admin/orgs/[id]/contract – tạo/sửa hợp đồng năm của doanh nghiệp gói CONTRACT. */
export const UpsertOrgContractInputSchema = z.object({ ...contractFields, valueVnd: VndSchema, ...withReason }).refine(contractRangeOk, { path: ["endsOn"], message: "Ngày kết thúc phải sau ngày bắt đầu" });
export type UpsertOrgContractInput = z.infer<typeof UpsertOrgContractInputSchema>;

/** Lý do điều chỉnh lượt tay (nạp chuyển khoản ngoài, tặng, hoàn, điều chỉnh). PURCHASE/CHARGE/CONTRACT_USE chỉ hệ thống ghi. */
export const ManualCreditReasonSchema = z.enum(["MANUAL_TOPUP", "GRANT", "REFUND", "ADJUST"]);
export type ManualCreditReason = z.infer<typeof ManualCreditReasonSchema>;

/**
 * POST /api/admin/orgs/[id]/credits – cộng/trừ lượt. `kind` = loại dòng sổ lượt, `note` = ghi chú hiện cho khách (bắt buộc),
 * `reason` = lý do ghi nhật ký quản trị. `amountVnd`: tiền tương ứng (vd chuyển khoản ngoài) – tùy chọn.
 */
export const AdjustOrgCreditsInputSchema = z
  .object({
    delta: z.number().int("Nhập số nguyên").min(-10_000, "Tối đa 10.000 lượt").max(10_000, "Tối đa 10.000 lượt").refine((v) => v !== 0, "Nhập số lượt khác 0"),
    kind: ManualCreditReasonSchema,
    note: z.string().trim().min(3, "Nhập ghi chú (ít nhất 3 ký tự)").max(500, "Ghi chú tối đa 500 ký tự"),
    amountVnd: VndSchema.optional(),
    /** Khóa chống ghi trùng do hộp thoại sinh mỗi lần mở (bấm hai lần không thành hai dòng). */
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Khóa chống trùng không hợp lệ").optional(),
    ...withReason,
  })
  .refine((v) => v.kind === "ADJUST" || v.kind === "REFUND" || v.delta > 0, { path: ["delta"], message: "Nạp/tặng lượt phải là số dương" });
export type AdjustOrgCreditsInput = z.infer<typeof AdjustOrgCreditsInputSchema>;

/** Sửa gói: PAYG – tên, trang/hồ sơ, đơn giá/lượt; CONTRACT – tên, trang/hồ sơ, giá niêm yết (0 = "Liên hệ"). */
export const UpdatePlanInputSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên gói"),
  pagesPerDossier: z.number().int("Nhập số nguyên").min(1, "Ít nhất 1 trang"),
  priceVnd: VndSchema,
  pricePerDeclarationVnd: VndSchema,
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
