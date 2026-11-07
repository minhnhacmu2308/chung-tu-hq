// Bộ nhãn 3 ngôn ngữ cho các mã back-office (vai trò, quyền, hành động nhật ký...). Bản `vi` giữ nguyên chữ cũ.
import type { AdminAction, AdminPermission, AdminTargetType, AnnouncementKind, AttentionKind, SkillKind, StaffRole } from "@kb/contracts";
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
    BILLING: "Đổi gói, điều chỉnh lượt, sửa hợp đồng, sửa danh mục gói",
    PLATFORM: "Cập nhật khóa API tích hợp, phát hành skill mẫu",
    STAFF: "Mời, đổi vai trò, khóa quản trị viên",
  },
  en: {
    VIEW: "View all screens and reports",
    SUPPORT: "Suspend/reactivate organizations and users; reset passwords; retry jobs; send announcements",
    BILLING: "Change plans, adjust credits, edit contracts and the plan catalog",
    PLATFORM: "Update integration API keys, publish skill templates",
    STAFF: "Invite admins, change their roles, disable them",
  },
  zh: {
    VIEW: "查看所有页面和报表",
    SUPPORT: "停用/启用企业和用户；重置密码；重跑任务；发送通知",
    BILLING: "更换套餐、调整次数、编辑合同和套餐目录",
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
    ORG_CONTRACT_UPDATED: "Cập nhật hợp đồng",
    ORG_CREDITS_ADJUSTED: "Điều chỉnh lượt",
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
    EMAIL_SENT: "Gửi email theo đợt",
    EMAIL_TEMPLATE_SAVED: "Lưu mẫu email",
    EMAIL_TEMPLATE_DELETED: "Xóa mẫu email",
    EMAIL_SIGNATURE_SAVED: "Lưu chữ ký email",
    EMAIL_SIGNATURE_DELETED: "Xóa chữ ký email",
    MAIL_SETTINGS_UPDATED: "Cập nhật máy chủ gửi mail",
  },
  en: {
    ORG_CREATED: "Create organization",
    ORG_SUSPENDED: "Suspend organization",
    ORG_REACTIVATED: "Reactivate organization",
    ORG_PLAN_CHANGED: "Change plan",
    ORG_CONTRACT_UPDATED: "Update contract",
    ORG_CREDITS_ADJUSTED: "Adjust credits",
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
    EMAIL_SENT: "Send email campaign",
    EMAIL_TEMPLATE_SAVED: "Save email template",
    EMAIL_TEMPLATE_DELETED: "Delete email template",
    EMAIL_SIGNATURE_SAVED: "Save email signature",
    EMAIL_SIGNATURE_DELETED: "Delete email signature",
    MAIL_SETTINGS_UPDATED: "Update mail server",
  },
  zh: {
    ORG_CREATED: "创建企业",
    ORG_SUSPENDED: "停用企业",
    ORG_REACTIVATED: "启用企业",
    ORG_PLAN_CHANGED: "更换套餐",
    ORG_CONTRACT_UPDATED: "更新合同",
    ORG_CREDITS_ADJUSTED: "调整额度",
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
    EMAIL_SENT: "批量发送邮件",
    EMAIL_TEMPLATE_SAVED: "保存邮件模板",
    EMAIL_TEMPLATE_DELETED: "删除邮件模板",
    EMAIL_SIGNATURE_SAVED: "保存邮件签名",
    EMAIL_SIGNATURE_DELETED: "删除邮件签名",
    MAIL_SETTINGS_UPDATED: "更新邮件服务器",
  },
});

export const TARGET_TYPE_LABELS: Messages<AdminTargetType> = defineMessages({
  vi: { ORG: "Doanh nghiệp", USER: "Người dùng", PLAN: "Gói", INTEGRATION: "Tích hợp", JOB: "Job", SKILL_TEMPLATE: "Skill mẫu", STAFF: "Quản trị viên", ANNOUNCEMENT: "Thông báo", EXCHANGE_RATE: "Tỷ giá", EMAIL: "Email" },
  en: { ORG: "Organization", USER: "User", PLAN: "Plan", INTEGRATION: "Integration", JOB: "Job", SKILL_TEMPLATE: "Skill template", STAFF: "Admin", ANNOUNCEMENT: "Announcement", EXCHANGE_RATE: "Exchange rate", EMAIL: "Email" },
  zh: { ORG: "企业", USER: "用户", PLAN: "套餐", INTEGRATION: "集成", JOB: "任务", SKILL_TEMPLATE: "技能模板", STAFF: "管理员", ANNOUNCEMENT: "通知", EXCHANGE_RATE: "汇率", EMAIL: "邮件" },
});

export const ADMIN_DISPLAY_MESSAGES = defineMessages({
  vi: {
    month: "Tháng {m}/{y}",
    audienceAll: "Mọi doanh nghiệp",
    audiencePlan: "Gói {plan}",
  },
  en: {
    month: "{m}/{y}",
    audienceAll: "All organizations",
    audiencePlan: "{plan} plan",
  },
  zh: {
    month: "{y}年{m}月",
    audienceAll: "所有企业",
    audiencePlan: "{plan} 套餐",
  },
});

/** Loại mục "Cần chú ý" ở Tổng quan vận hành (ADR 0011 thêm LOW_CREDITS / CONTRACT_*). */
export const ATTENTION_KIND_LABELS: Messages<AttentionKind> = defineMessages({
  vi: {
    LOW_CREDITS: "Sắp hết lượt", CONTRACT_EXPIRING: "Hợp đồng sắp hết hạn", CONTRACT_EXPIRED: "Hợp đồng hết hạn", CONTRACT_NO_END: "Hợp đồng chưa có ngày kết thúc",
    INTEGRATION_ERROR: "Kết nối lỗi", JOBS_FAILED: "Job lỗi", JOIN_PENDING: "Yêu cầu tham gia", RATE_FETCH: "Tỷ giá",
  },
  en: {
    LOW_CREDITS: "Low credits", CONTRACT_EXPIRING: "Contract expiring", CONTRACT_EXPIRED: "Contract expired", CONTRACT_NO_END: "Contract without end date",
    INTEGRATION_ERROR: "Integration error", JOBS_FAILED: "Failed jobs", JOIN_PENDING: "Join requests", RATE_FETCH: "Exchange rate",
  },
  zh: {
    LOW_CREDITS: "次数不足", CONTRACT_EXPIRING: "合同即将到期", CONTRACT_EXPIRED: "合同已到期", CONTRACT_NO_END: "合同无结束日期",
    INTEGRATION_ERROR: "集成错误", JOBS_FAILED: "任务失败", JOIN_PENDING: "加入申请", RATE_FETCH: "汇率",
  },
});
