// Bộ nhãn 3 ngôn ngữ cho các mã back-office (vai trò, quyền, hành động nhật ký...). Bản `vi` giữ nguyên chữ cũ.
import type { AdminAction, AdminPermission, AdminTargetType, AnnouncementKind, SkillKind, StaffRole } from "@kb/contracts";
import { defineMessages, type Messages } from "@kb/ui";

export const STAFF_ROLE_LABELS: Messages<StaffRole> = defineMessages({
  vi: { SUPER_ADMIN: "Quản trị cấp cao", SUPPORT: "Hỗ trợ", READONLY: "Chỉ xem" },
  en: { SUPER_ADMIN: "Super admin", SUPPORT: "Support", READONLY: "Read-only" },
  zh: { SUPER_ADMIN: "超级管理员", SUPPORT: "支持", READONLY: "只读" },
});

/** Nhãn theo khóa quyền của STAFF_PERMISSIONS (@kb/contracts) – contracts giữ nguyên, nhãn hiển thị nằm ở app. */
export const PERMISSION_LABELS: Messages<AdminPermission> = defineMessages({
  vi: {
    VIEW: "Xem mọi màn và báo cáo",
    SUPPORT: "Khóa/mở doanh nghiệp, người dùng; đặt lại mật khẩu; chạy lại job; gửi thông báo",
    BILLING: "Đổi gói, nới hạn mức, sửa danh mục gói",
    PLATFORM: "Cập nhật khóa API tích hợp, phát hành skill mẫu",
    STAFF: "Mời, đổi vai trò, khóa quản trị viên",
  },
  en: {
    VIEW: "View all screens and reports",
    SUPPORT: "Suspend/reactivate organizations and users; reset passwords; retry jobs; send announcements",
    BILLING: "Change plans, raise quotas, edit the plan catalog",
    PLATFORM: "Update integration API keys, publish skill templates",
    STAFF: "Invite admins, change their roles, disable them",
  },
  zh: {
    VIEW: "查看所有页面和报表",
    SUPPORT: "停用/启用企业和用户；重置密码；重跑任务；发送通知",
    BILLING: "更换套餐、提高额度、编辑套餐目录",
    PLATFORM: "更新集成 API 密钥、发布技能模板",
    STAFF: "邀请管理员、变更角色、停用管理员",
  },
});

export const SKILL_KIND_LABELS: Messages<SkillKind> = defineMessages({
  vi: { DOCUMENT: "Đọc chứng từ", SUPPLIER: "Theo nhà cung cấp" },
  en: { DOCUMENT: "Document reading", SUPPLIER: "Per supplier" },
  zh: { DOCUMENT: "单证读取", SUPPLIER: "按供应商" },
});

export const ANNOUNCEMENT_KIND_LABELS: Messages<AnnouncementKind> = defineMessages({
  vi: { INFO: "Thông tin", MAINTENANCE: "Bảo trì" },
  en: { INFO: "Information", MAINTENANCE: "Maintenance" },
  zh: { INFO: "信息", MAINTENANCE: "维护" },
});

export const ACTION_LABELS: Messages<AdminAction> = defineMessages({
  vi: {
    ORG_CREATED: "Tạo doanh nghiệp",
    ORG_SUSPENDED: "Tạm khóa doanh nghiệp",
    ORG_REACTIVATED: "Mở khóa doanh nghiệp",
    ORG_PLAN_CHANGED: "Đổi gói",
    ORG_QUOTA_ADJUSTED: "Nới hạn mức",
    ORG_TRIAL_EXTENDED: "Gia hạn dùng thử",
    USER_DISABLED: "Khóa người dùng",
    USER_ENABLED: "Mở khóa người dùng",
    USER_PASSWORD_RESET_SENT: "Gửi đặt lại mật khẩu",
    USER_VERIFICATION_RESENT: "Gửi lại xác thực email",
    USER_SESSIONS_REVOKED: "Đăng xuất mọi phiên",
    PLAN_UPDATED: "Sửa gói dịch vụ",
    INTEGRATION_KEY_UPDATED: "Cập nhật khóa API",
    JOB_RETRIED: "Chạy lại job",
    SKILL_TEMPLATE_PUBLISHED: "Phát hành skill mẫu",
    SKILL_TEMPLATE_UNPUBLISHED: "Ngừng phát hành skill mẫu",
    STAFF_INVITED: "Mời quản trị viên",
    STAFF_ROLE_CHANGED: "Đổi vai trò quản trị viên",
    STAFF_DISABLED: "Khóa quản trị viên",
    STAFF_ENABLED: "Mở khóa quản trị viên",
    STAFF_MFA_ENABLED: "Bật xác thực 2 lớp",
    STAFF_MFA_RESET: "Đặt lại xác thực 2 lớp",
    ANNOUNCEMENT_SENT: "Gửi thông báo hệ thống",
    ANNOUNCEMENT_WITHDRAWN: "Thu hồi thông báo",
    EXCHANGE_RATE_UPDATED: "Sửa tỷ giá tính thuế",
  },
  en: {
    ORG_CREATED: "Create organization",
    ORG_SUSPENDED: "Suspend organization",
    ORG_REACTIVATED: "Reactivate organization",
    ORG_PLAN_CHANGED: "Change plan",
    ORG_QUOTA_ADJUSTED: "Raise quota",
    ORG_TRIAL_EXTENDED: "Extend trial",
    USER_DISABLED: "Disable user",
    USER_ENABLED: "Enable user",
    USER_PASSWORD_RESET_SENT: "Send password reset",
    USER_VERIFICATION_RESENT: "Resend email verification",
    USER_SESSIONS_REVOKED: "Sign out all sessions",
    PLAN_UPDATED: "Edit plan",
    INTEGRATION_KEY_UPDATED: "Update API key",
    JOB_RETRIED: "Retry job",
    SKILL_TEMPLATE_PUBLISHED: "Publish skill template",
    SKILL_TEMPLATE_UNPUBLISHED: "Unpublish skill template",
    STAFF_INVITED: "Invite admin",
    STAFF_ROLE_CHANGED: "Change admin role",
    STAFF_DISABLED: "Disable admin",
    STAFF_ENABLED: "Enable admin",
    STAFF_MFA_ENABLED: "Enable two-factor authentication",
    STAFF_MFA_RESET: "Reset two-factor authentication",
    ANNOUNCEMENT_SENT: "Send system announcement",
    ANNOUNCEMENT_WITHDRAWN: "Withdraw announcement",
    EXCHANGE_RATE_UPDATED: "Edit customs exchange rate",
  },
  zh: {
    ORG_CREATED: "创建企业",
    ORG_SUSPENDED: "停用企业",
    ORG_REACTIVATED: "启用企业",
    ORG_PLAN_CHANGED: "更换套餐",
    ORG_QUOTA_ADJUSTED: "提高额度",
    ORG_TRIAL_EXTENDED: "延长试用",
    USER_DISABLED: "停用用户",
    USER_ENABLED: "启用用户",
    USER_PASSWORD_RESET_SENT: "发送密码重置",
    USER_VERIFICATION_RESENT: "重发邮箱验证",
    USER_SESSIONS_REVOKED: "注销所有会话",
    PLAN_UPDATED: "编辑套餐",
    INTEGRATION_KEY_UPDATED: "更新 API 密钥",
    JOB_RETRIED: "重跑任务",
    SKILL_TEMPLATE_PUBLISHED: "发布技能模板",
    SKILL_TEMPLATE_UNPUBLISHED: "取消发布技能模板",
    STAFF_INVITED: "邀请管理员",
    STAFF_ROLE_CHANGED: "变更管理员角色",
    STAFF_DISABLED: "停用管理员",
    STAFF_ENABLED: "启用管理员",
    STAFF_MFA_ENABLED: "启用双重验证",
    STAFF_MFA_RESET: "重置双重验证",
    ANNOUNCEMENT_SENT: "发送系统通知",
    ANNOUNCEMENT_WITHDRAWN: "撤回通知",
    EXCHANGE_RATE_UPDATED: "修改计税汇率",
  },
});

export const TARGET_TYPE_LABELS: Messages<AdminTargetType> = defineMessages({
  vi: { ORG: "Doanh nghiệp", USER: "Người dùng", PLAN: "Gói", INTEGRATION: "Tích hợp", JOB: "Job", SKILL_TEMPLATE: "Skill mẫu", STAFF: "Quản trị viên", ANNOUNCEMENT: "Thông báo", EXCHANGE_RATE: "Tỷ giá" },
  en: { ORG: "Organization", USER: "User", PLAN: "Plan", INTEGRATION: "Integration", JOB: "Job", SKILL_TEMPLATE: "Skill template", STAFF: "Admin", ANNOUNCEMENT: "Announcement", EXCHANGE_RATE: "Exchange rate" },
  zh: { ORG: "企业", USER: "用户", PLAN: "套餐", INTEGRATION: "集成", JOB: "任务", SKILL_TEMPLATE: "技能模板", STAFF: "管理员", ANNOUNCEMENT: "通知", EXCHANGE_RATE: "汇率" },
});

export const ADMIN_DISPLAY_MESSAGES = defineMessages({
  vi: {
    unlimited: "Không giới hạn",
    overQuota: "Vượt hạn mức",
    quotaExhausted: "Hết hạn mức",
    nearQuota: "Sắp hết hạn mức",
    withinQuota: "Trong hạn mức",
    month: "Tháng {m}/{y}",
    audienceAll: "Mọi doanh nghiệp",
    audiencePlan: "Gói {plan}",
  },
  en: {
    unlimited: "Unlimited",
    overQuota: "Over quota",
    quotaExhausted: "Quota used up",
    nearQuota: "Nearly at quota",
    withinQuota: "Within quota",
    month: "{m}/{y}",
    audienceAll: "All organizations",
    audiencePlan: "{plan} plan",
  },
  zh: {
    unlimited: "不限",
    overQuota: "超出额度",
    quotaExhausted: "额度已用完",
    nearQuota: "额度即将用完",
    withinQuota: "额度内",
    month: "{y}年{m}月",
    audienceAll: "所有企业",
    audiencePlan: "{plan} 套餐",
  },
});
