// Back-office (/api/admin/**) – gọi backend thật. Cùng chữ ký với src/mocks/api/admin.ts.
import {
  AdminAuditEntrySchema, AdminMfaEnabledSchema, AdminMfaSetupSchema, AdminOrgDetailSchema, AdminOrgSchema, AdminOverviewSchema, AdminPlanSchema, AdminSessionSchema, AdminUserSchema, AnnouncementSchema,
  FailedJobSchema, PlatformIntegrationSchema, SkillTemplateSchema, StaffSchema, SystemHealthSchema, UsageMonthSchema, UsageReportSchema,
  type AdjustOrgQuotaInput, type AdminReasonInput, type ChangeOrgPlanInput, type ChangeStaffRoleInput, type ExtendOrgTrialInput, type IntegrationId,
  type InviteStaffInput, type PlanCode, type SendAnnouncementInput, type SetTemplatePublishedInput, type UpdateIntegrationKeyInput, type UpdatePlanInput,
} from "@kb/contracts";
import { z } from "zod";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/http";
import { ApiError } from "@/lib/api-error";

const enc = encodeURIComponent;
const qs = (filter: { orgId?: string }) => (filter.orgId ? `?orgId=${enc(filter.orgId)}` : "");

/** null = không phải quản trị viên (hoặc chưa đăng nhập) – không coi là lỗi. */
export const getAdminSession = async () => {
  try {
    return (await apiGet("admin/session", z.object({ session: AdminSessionSchema.nullable() }))).session;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
};

export const getAdminOverview = () => apiGet("admin/overview", AdminOverviewSchema);

export const listAdminOrgs = () => apiGet("admin/orgs", z.array(AdminOrgSchema));
export const getAdminOrg = (id: string) => apiGet(`admin/orgs/${enc(id)}`, AdminOrgDetailSchema);
export const suspendOrg = (id: string, input: AdminReasonInput) => apiPost(`admin/orgs/${enc(id)}/suspend`, input, AdminOrgSchema);
export const reactivateOrg = (id: string, input: AdminReasonInput) => apiPost(`admin/orgs/${enc(id)}/reactivate`, input, AdminOrgSchema);
export const changeOrgPlan = (id: string, input: ChangeOrgPlanInput) => apiPost(`admin/orgs/${enc(id)}/plan`, input, AdminOrgSchema);
export const adjustOrgQuota = (id: string, input: AdjustOrgQuotaInput) => apiPost(`admin/orgs/${enc(id)}/quota`, input, AdminOrgSchema);
export const extendOrgTrial = (id: string, input: ExtendOrgTrialInput) => apiPost(`admin/orgs/${enc(id)}/trial`, input, AdminOrgSchema);

export const listAdminUsers = (filter: { orgId?: string } = {}) => apiGet(`admin/users${qs(filter)}`, z.array(AdminUserSchema));
export const setAdminUserDisabled = (id: string, disabled: boolean, input: AdminReasonInput) => apiPost(`admin/users/${enc(id)}/disabled`, { ...input, disabled }, AdminUserSchema);
export const sendUserPasswordReset = (id: string, input: AdminReasonInput) => apiPost(`admin/users/${enc(id)}/password-reset`, input, AdminUserSchema);
export const resendUserVerification = (id: string, input: AdminReasonInput) => apiPost(`admin/users/${enc(id)}/verification`, input, AdminUserSchema);
export const revokeUserSessions = (id: string, input: AdminReasonInput) => apiPost(`admin/users/${enc(id)}/revoke-sessions`, input, AdminUserSchema);

export const listAdminPlans = () => apiGet("admin/plans", z.array(AdminPlanSchema));
export const updateAdminPlan = (code: PlanCode, input: UpdatePlanInput) => apiPatch(`admin/plans/${enc(code)}`, input, AdminPlanSchema);

export const listUsageMonths = () => apiGet("admin/usage/months", z.array(UsageMonthSchema));
export const getUsageReport = (month: string) => apiGet(`admin/usage?month=${enc(month)}`, UsageReportSchema);

export const listPlatformIntegrations = () => apiGet("admin/integrations", z.array(PlatformIntegrationSchema));
export const testPlatformIntegration = (id: IntegrationId) => apiPost(`admin/integrations/${enc(id)}/test`, {}, PlatformIntegrationSchema);
export const updateIntegrationKey = (id: IntegrationId, input: UpdateIntegrationKeyInput) => apiPut(`admin/integrations/${enc(id)}/key`, input, PlatformIntegrationSchema);

export const getSystemHealth = () => apiGet("admin/system", SystemHealthSchema);
export const retryFailedJob = (id: string, input: AdminReasonInput) => apiPost(`admin/system/jobs/${enc(id)}/retry`, input, FailedJobSchema);

export const listSkillTemplates = () => apiGet("admin/skill-templates", z.array(SkillTemplateSchema));
export const setSkillTemplatePublished = (id: string, input: SetTemplatePublishedInput) => apiPost(`admin/skill-templates/${enc(id)}/published`, input, SkillTemplateSchema);

export const listStaff = () => apiGet("admin/staff", z.array(StaffSchema));
export const inviteStaff = (input: InviteStaffInput) => apiPost("admin/staff", input, StaffSchema);
export const changeStaffRole = (id: string, input: ChangeStaffRoleInput) => apiPatch(`admin/staff/${enc(id)}/role`, input, StaffSchema);
export const setStaffDisabled = (id: string, disabled: boolean, input: AdminReasonInput) => apiPost(`admin/staff/${enc(id)}/disabled`, { ...input, disabled }, StaffSchema);

export const listAdminAudit = (filter: { orgId?: string } = {}) => apiGet(`admin/audit${qs(filter)}`, z.array(AdminAuditEntrySchema));

export const listAnnouncements = () => apiGet("admin/announcements", z.array(AnnouncementSchema));
export const sendAnnouncement = (input: SendAnnouncementInput) => apiPost("admin/announcements", input, AnnouncementSchema);
export const withdrawAnnouncement = (id: string, input: AdminReasonInput) => apiPost(`admin/announcements/${enc(id)}/withdraw`, input, AnnouncementSchema);

// Xác thực 2 lớp của tài khoản quản trị (B11).
export const startAdminMfaSetup = () => apiPost("admin/mfa/setup", {}, AdminMfaSetupSchema);
export const confirmAdminMfaSetup = (code: string) => apiPost("admin/mfa/confirm", { code }, AdminMfaEnabledSchema);
export const verifyAdminMfa = (code: string) => apiPost("admin/mfa/verify", { code }, z.object({ recoveryCodesLeft: z.number().int() }));
export const resetStaffMfa = (id: string, input: AdminReasonInput) => apiPost(`admin/staff/${enc(id)}/mfa-reset`, input, StaffSchema);
