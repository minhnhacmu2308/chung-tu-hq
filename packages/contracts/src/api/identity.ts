// Input/output của nhóm API auth / org / notifications. Dùng ở route handler (parse) và FE (parse response).
import { z } from "zod";

/** Một dòng nhật ký hoạt động của doanh nghiệp (org_audit) – `action` là mã ổn định, giao diện dịch. */
export const OrgAuditEntrySchema = z.object({
  id: z.string(), at: z.string(), actorId: z.string(), actorName: z.string(), action: z.string(), targetType: z.string(), targetId: z.string(), targetLabel: z.string(),
  detail: z.record(z.string(), z.unknown()).nullable(),
});
export type OrgAuditEntryDto = z.infer<typeof OrgAuditEntrySchema>;
import { IsoDateSchema, IsoDateTimeSchema, RoleSchema } from "../common.js";
import { MemberSchema, OrganizationSchema } from "../dto/index.js";

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email("Email không hợp lệ"));
export const TaxCodeSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length === 10 || s.length === 13, "MST gồm 10 hoặc 13 chữ số");
export const PasswordSchema = z.string().min(8, "Mật khẩu ít nhất 8 ký tự").max(128);

export const LoginInputSchema = z.object({ email: EmailSchema, password: z.string().min(1) });
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const RegisterInputSchema = z.object({
  email: EmailSchema,
  name: z.string().trim().min(2, "Nhập họ tên"),
  password: PasswordSchema,
  taxCode: TaxCodeSchema,
  joinExisting: z.boolean(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const RegisterResultSchema = z.object({ ok: z.literal(true), mode: z.enum(["CREATED_ORG", "JOIN_REQUESTED"]) });
export type RegisterResult = z.infer<typeof RegisterResultSchema>;

export const CompanyLookupSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({ found: z.literal(true), existing: z.boolean(), name: z.string(), address: z.string() }),
]);
export type CompanyLookup = z.infer<typeof CompanyLookupSchema>;

export const SessionSchema = z.object({
  user: MemberSchema,
  org: OrganizationSchema,
  /** Tài khoản do quản trị tạo hộ bằng mật khẩu tạm – phải đổi mật khẩu trước khi dùng (API khác trả PASSWORD_CHANGE_REQUIRED). */
  mustChangePassword: z.boolean().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export const VerifyEmailInputSchema = z.object({ token: z.string().min(16) });
export const ForgotPasswordInputSchema = z.object({ email: EmailSchema });
export const ResetPasswordInputSchema = z.object({ token: z.string().min(16), password: PasswordSchema });
export const ChangePasswordInputSchema = z
  .object({ currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại"), newPassword: PasswordSchema })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Mật khẩu mới phải khác mật khẩu hiện tại" });
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;
export const AcceptInviteInputSchema = z.object({ token: z.string().min(16), name: z.string().trim().min(2, "Nhập họ tên"), password: PasswordSchema });
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>;

/**
 * Mã bưu chính doanh nghiệp: 5 chữ số (mã bưu chính quốc gia từ 2018) hoặc 6 chữ số (mã cũ, VNACCS nhận tối đa 7 ký tự) (ô TK_IMY/TK_EPP, chỉ tiêu 1.14 IDA / 2.13 EDA); "" = xóa (khi truyền IDA gửi "000000").
 */
export const PostalCodeSchema = z.string().trim().regex(/^(\d{5,6})?$/, "Mã bưu chính gồm 5 hoặc 6 chữ số");

export const OrgProfileInputSchema = z.object({
  name: z.string().trim().min(1, "Tên doanh nghiệp không được để trống"),
  address: z.string().trim(),
  phone: z.string().trim(),
  /** Không gửi = giữ nguyên. */
  postalCode: PostalCodeSchema.optional(),
});
export type OrgProfileInput = z.infer<typeof OrgProfileInputSchema>;

export const SuspectThresholdInputSchema = z.object({ threshold: z.enum(["STRICT", "BALANCED", "RELAXED"]) });
export const FourEyesInputSchema = z.object({ enabled: z.boolean() });

const NonOwnerRole = RoleSchema.exclude(["OWNER"]);
export const InviteMemberInputSchema = z.object({ email: EmailSchema, role: NonOwnerRole });
export type InviteMemberInput = z.infer<typeof InviteMemberInputSchema>;
export const ChangeRoleInputSchema = z.object({ role: NonOwnerRole });
export const SetDisabledInputSchema = z.object({ disabled: z.boolean() });

export const AddCertificateInputSchema = z.object({
  issuer: z.string().trim().min(1, "Chọn nhà cung cấp"),
  serial: z.string().trim().min(1, "Nhập số serial chứng thư").transform((s) => s.toUpperCase()),
  validTo: IsoDateSchema,
});
export type AddCertificateInput = z.infer<typeof AddCertificateInputSchema>;

export const JoinRequestSchema = z.object({ id: z.string(), userId: z.string(), name: z.string(), email: z.string(), requestedAt: IsoDateTimeSchema });
export type JoinRequest = z.infer<typeof JoinRequestSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });

/** Từ chối yêu cầu tham gia: lý do tùy chọn, gửi kèm email cho người xin. Chuỗi rỗng = không có lý do. */
export const RejectJoinRequestInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "Lý do tối đa 500 ký tự")
    .optional()
    .transform((s) => (s ? s : undefined)),
});
export type RejectJoinRequestInput = z.input<typeof RejectJoinRequestInputSchema>;

/** Chuyển quyền sở hữu: nhập lại mật khẩu của Chủ sở hữu hiện tại để xác nhận. */
export const TransferOwnershipInputSchema = z.object({ password: z.string().min(1, "Nhập mật khẩu để xác nhận").max(128) });
export type TransferOwnershipInput = z.infer<typeof TransferOwnershipInputSchema>;
/** Kết quả: người nhận thành OWNER, chủ cũ thành ADMIN. */
export const TransferOwnershipResultSchema = z.object({ owner: MemberSchema, previousOwner: MemberSchema });
export type TransferOwnershipResult = z.infer<typeof TransferOwnershipResultSchema>;
