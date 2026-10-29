// PUBLIC API của module admin (khu Quản trị hệ thống, ADR 0006). Hạ tầng qua "@kb/core/modules/admin/infrastructure" (chỉ container.ts).
export type { AdminDeps, AdminRepos, AdminUow, AttemptLimiter, IdentityGateway, IntegrationProbe, JobMonitor, KeyVault, QrRenderer, SystemProbe, FailedJobInfo } from "./application/ports.js";
export { resolveStaff, resolveStaffSession, type StaffActor, type StaffSession } from "./application/_shared.js";
export { confirmMfaSetup, resetStaffMfa, startMfaSetup, verifyMfa } from "./application/mfa.js";
export { getAdminSession, listStaff, inviteStaff, changeStaffRole, setStaffDisabled, listAudit } from "./application/staff.js";
export { listOrgs, getOrg, createOrg, suspendOrg, reactivateOrg, changeOrgPlan, adjustOrgQuota, extendOrgTrial } from "./application/orgs.js";
export { listUsers, setUserDisabled, sendPasswordReset, resendVerification, revokeUserSessions } from "./application/users.js";
export { listPlans, updatePlan, listUsageMonths, getUsageReport } from "./application/billing.js";
export { listPlatformIntegrations, testPlatformIntegration, updateIntegrationKey, getSystemHealth, retryFailedJob, listSkillTemplates, setSkillTemplatePublished, PLATFORM_INTEGRATIONS } from "./application/platform.js";
export { listAnnouncements, sendAnnouncement, withdrawAnnouncement } from "./application/announcements.js";
export { getOverview } from "./application/overview.js";
export { vnMonth } from "./domain/period.js";
export { activeQuotaBonus, withinDossierQuota } from "../../shared/quota.js";
export { captureWeeklyRates, ensureCurrentWeekRates, listExchangeRates, recordRateCatchUpFailure, recordRateFetchFailure, upsertExchangeRate, nextRateRunAt, RATE_JOB_CRON, type RateDeps, type VcbRateSource } from "./application/exchange-rates.js";
export {
  listEmailTemplates, saveEmailTemplate, deleteEmailTemplate, listEmailSignatures, saveEmailSignature, deleteEmailSignature, previewEmailAudience,
  sendTestEmail, sendEmail, processEmailCampaign, listEmailCampaigns, getEmailCampaign, draftEmailWithAi, getMailSettings, updateMailSettings, testMailSettings, EMAIL_FOOTER,
} from "./application/email.js";
export type { PlatformMailer, EmailDraftAi, AiCallUsage } from "./application/ports.js";
