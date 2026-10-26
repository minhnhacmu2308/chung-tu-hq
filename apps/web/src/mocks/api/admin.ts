// Back-office của bên vận hành (mock). Nghiệp vụ nằm ở mocks/admin/ops.ts; file này chỉ thêm độ trễ mạng giả + lưu localStorage.
// Thay thân hàm bằng fetch tới /api/admin/** khi có backend – giữ nguyên chữ ký.
import type {
  DraftEmailInput, EmailAudience, SaveEmailSignatureInput, SaveEmailTemplateInput, SendEmailInput, SendTestEmailInput, UpdateMailSettingsInput,
  UpsertExchangeRateInput,
  AdjustOrgQuotaInput, AdminReasonInput, ChangeOrgPlanInput, ChangeStaffRoleInput, CreateOrgInput, ExtendOrgTrialInput, IntegrationId, InviteStaffInput,
  PlanCode, SendAnnouncementInput, SetTemplatePublishedInput, UpdateIntegrationKeyInput, UpdatePlanInput,
} from "@kb/contracts";
import { ApiError, mutate, query } from "@/lib/mock-request";
import * as ops from "@/mocks/admin/ops";
import * as email from "@/mocks/admin/email-ops";

export const adminKeys = {
  all: ["admin"] as const,
  session: ["admin", "session"] as const,
  overview: ["admin", "overview"] as const,
  orgs: ["admin", "orgs"] as const,
  org: (id: string) => ["admin", "orgs", id] as const,
  users: (f: { orgId?: string } = {}) => ["admin", "users", f] as const,
  plans: ["admin", "plans"] as const,
  usageMonths: ["admin", "usage", "months"] as const,
  usage: (month: string) => ["admin", "usage", month] as const,
  integrations: ["admin", "integrations"] as const,
  exchangeRates: ["admin", "exchange-rates"] as const,
  system: ["admin", "system"] as const,
  skillTemplates: ["admin", "skill-templates"] as const,
  staff: ["admin", "staff"] as const,
  audit: (f: { orgId?: string } = {}) => ["admin", "audit", f] as const,
  announcements: ["admin", "announcements"] as const,
  emailTemplates: ["admin", "email", "templates"] as const,
  emailSignatures: ["admin", "email", "signatures"] as const,
  emailCampaigns: ["admin", "email", "campaigns"] as const,
  emailCampaign: (id: string) => ["admin", "email", "campaigns", id] as const,
  mailSettings: ["admin", "email", "settings"] as const,
};

/**
 * Tài khoản đang đăng nhập có quyền quản trị hệ thống không (null = không). Đăng nhập/đăng xuất dùng CHUNG với ứng dụng
 * (api/session.ts) – ở đây chỉ đọc quyền của phiên hiện tại.
 */
export const getAdminSession = () => query((db) => ops.getAdminSession(db));

export const getAdminOverview = () => query((db) => ops.getOverview(db));

export const listAdminOrgs = () => query((db) => ops.listOrgs(db));
export const getAdminOrg = (id: string) => query((db) => ops.getOrg(db, id));
export const suspendOrg = (id: string, input: AdminReasonInput) => mutate((db) => ops.suspendOrg(db, id, input));
export const reactivateOrg = (id: string, input: AdminReasonInput) => mutate((db) => ops.reactivateOrg(db, id, input));
export const createOrg = (input: CreateOrgInput) => mutate((db) => ops.createOrg(db, input));
export const changeOrgPlan = (id: string, input: ChangeOrgPlanInput) => mutate((db) => ops.changeOrgPlan(db, id, input));
export const adjustOrgQuota = (id: string, input: AdjustOrgQuotaInput) => mutate((db) => ops.adjustOrgQuota(db, id, input));
export const extendOrgTrial = (id: string, input: ExtendOrgTrialInput) => mutate((db) => ops.extendOrgTrial(db, id, input));

export const listAdminUsers = (filter: { orgId?: string } = {}) => query((db) => ops.listUsers(db, filter));
export const setAdminUserDisabled = (id: string, disabled: boolean, input: AdminReasonInput) => mutate((db) => ops.setUserDisabled(db, id, disabled, input));
export const sendUserPasswordReset = (id: string, input: AdminReasonInput) => mutate((db) => ops.sendPasswordReset(db, id, input));
export const resendUserVerification = (id: string, input: AdminReasonInput) => mutate((db) => ops.resendVerification(db, id, input));
export const revokeUserSessions = (id: string, input: AdminReasonInput) => mutate((db) => ops.revokeUserSessions(db, id, input));

export const listAdminPlans = () => query((db) => ops.listPlans(db));
export const updateAdminPlan = (code: PlanCode, input: UpdatePlanInput) => mutate((db) => ops.updatePlan(db, code, input));

export const listUsageMonths = () => query(() => ops.usageMonths());
export const getUsageReport = (month: string) => query((db) => ops.getUsageReport(db, month));

export const listPlatformIntegrations = () => query((db) => ops.listPlatformIntegrations(db));
export const listExchangeRates = () => query((db) => ops.listExchangeRates(db));
export const upsertExchangeRate = (input: UpsertExchangeRateInput) => mutate((db) => ops.upsertExchangeRate(db, input));
export const testPlatformIntegration = (id: IntegrationId) => mutate((db) => ops.testPlatformIntegration(db, id));
export const updateIntegrationKey = (id: IntegrationId, input: UpdateIntegrationKeyInput) => mutate((db) => ops.updateIntegrationKey(db, id, input));

export const getSystemHealth = () => query((db) => ops.getSystemHealth(db));
export const retryFailedJob = (id: string, input: AdminReasonInput) => mutate((db) => ops.retryJob(db, id, input));

export const listSkillTemplates = () => query((db) => ops.listSkillTemplates(db));
export const setSkillTemplatePublished = (id: string, input: SetTemplatePublishedInput) => mutate((db) => ops.setTemplatePublished(db, id, input));

export const listStaff = () => query((db) => ops.listStaff(db));
export const inviteStaff = (input: InviteStaffInput) => mutate((db) => ops.inviteStaff(db, input));
export const changeStaffRole = (id: string, input: ChangeStaffRoleInput) => mutate((db) => ops.changeStaffRole(db, id, input));
export const setStaffDisabled = (id: string, disabled: boolean, input: AdminReasonInput) => mutate((db) => ops.setStaffDisabled(db, id, disabled, input));

export const listAdminAudit = (filter: { orgId?: string } = {}) => query((db) => ops.listAudit(db, filter));

export const listAnnouncements = () => query((db) => ops.listAnnouncements(db));
export const sendAnnouncement = (input: SendAnnouncementInput) => mutate((db) => ops.sendAnnouncement(db, input));
export const withdrawAnnouncement = (id: string, input: AdminReasonInput) => mutate((db) => ops.withdrawAnnouncement(db, id, input));

// Bản mô phỏng không có xác thực 2 lớp: phiên quản trị luôn coi như đã xác thực (getAdminSession không trả `mfa`).
const NO_MFA = () => {
  throw new ApiError("NOT_SUPPORTED", "Bản mô phỏng không dùng xác thực 2 lớp", 422);
};
export const startAdminMfaSetup = async (): Promise<{ secret: string; otpauthUri: string; qrSvg: string }> => NO_MFA();
export const confirmAdminMfaSetup = async (_code: string): Promise<{ recoveryCodes: string[] }> => NO_MFA();
export const verifyAdminMfa = async (_code: string): Promise<{ recoveryCodesLeft: number }> => NO_MFA();
export const resetStaffMfa = async (_id: string, _input: AdminReasonInput): Promise<import("@kb/contracts").Staff> => NO_MFA();

/* ---------------- Email ---------------- */
export const listEmailTemplates = () => query((db) => email.listTemplates(db));
export const saveEmailTemplate = (id: string | null, input: SaveEmailTemplateInput) => mutate((db) => email.saveTemplate(db, id, input));
export const deleteEmailTemplate = (id: string) => mutate((db) => email.deleteTemplate(db, id));
export const listEmailSignatures = () => query((db) => email.listSignatures(db));
export const saveEmailSignature = (id: string | null, input: SaveEmailSignatureInput) => mutate((db) => email.saveSignature(db, id, input));
export const deleteEmailSignature = (id: string) => mutate((db) => email.deleteSignature(db, id));
export const previewEmailAudience = (input: EmailAudience) => query((db) => email.previewAudience(db, input));
export const sendTestEmail = (input: SendTestEmailInput) => mutate((db) => email.sendTest(db, input));
export const sendEmail = (input: SendEmailInput) => mutate((db) => email.send(db, input));
export const listEmailCampaigns = () => query((db) => email.listCampaigns(db));
export const getEmailCampaign = (id: string) => query((db) => email.getCampaign(db, id));
export const draftEmailWithAi = (input: DraftEmailInput) => mutate((db) => email.draft(db, input));
export const getMailSettings = () => query((db) => email.getSettings(db));
export const updateMailSettings = (input: UpdateMailSettingsInput) => mutate((db) => email.updateSettings(db, input));
export const testMailSettings = () => mutate((db) => email.testSettings(db));
