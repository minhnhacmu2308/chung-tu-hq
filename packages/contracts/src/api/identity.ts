// Input/output của nhóm API auth / org / notifications. Dùng ở route handler (parse) và FE (parse response).
import { z } from "zod";
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

export const SessionSchema = z.object({ user: MemberSchema, org: OrganizationSchema });
export type Session = z.infer<typeof SessionSchema>;

export const VerifyEmailInputSchema = z.object({ token: z.string().min(16) });
export const ForgotPasswordInputSchema = z.object({ email: EmailSchema });
export const ResetPasswordInputSchema = z.object({ token: z.string().min(16), password: PasswordSchema });
export const AcceptInviteInputSchema = z.object({ token: z.string().min(16), name: z.string().trim().min(2, "Nhập họ tên"), password: PasswordSchema });
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>;

export const OrgProfileInputSchema = z.object({
  name: z.string().trim().min(1, "Tên doanh nghiệp không được để trống"),
  address: z.string().trim(),
  phone: z.string().trim(),
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
