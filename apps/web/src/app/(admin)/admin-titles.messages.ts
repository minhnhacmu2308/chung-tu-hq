// Tiêu đề tab trình duyệt của khu Quản trị hệ thống. Metadata dựng phía máy chủ – chưa biết ngôn ngữ người dùng
// (ngôn ngữ lưu ở phía client) nên metadata lấy bản "vi"; bản en/zh sẵn sàng khi chuyển ngôn ngữ sang máy chủ.
// Chỉ import kiểu từ @kb/ui: file này chạy trong Server Component, không được kéo theo React context của thư viện.
import type { Messages } from "@kb/ui";

type TitleKey =
  | "root" | "template" | "overview" | "announcements" | "audit" | "exchangeRates" | "integrations" | "orgs" | "plans"
  | "skillTemplates" | "staff" | "system" | "usage" | "users";

export const ADMIN_TITLE_MESSAGES: Messages<TitleKey> = {
  vi: {
    root: "Quản trị hệ thống",
    template: "%s · Quản trị KhaiBáo AI",
    overview: "Tổng quan vận hành",
    announcements: "Thông báo hệ thống",
    audit: "Nhật ký quản trị",
    exchangeRates: "Tỷ giá tính thuế",
    integrations: "Tích hợp dùng chung",
    orgs: "Doanh nghiệp",
    plans: "Gói dịch vụ",
    skillTemplates: "Skill mẫu",
    staff: "Quản trị viên",
    system: "Sức khỏe hệ thống",
    usage: "Sử dụng & chi phí",
    users: "Người dùng",
  },
  en: {
    root: "System administration",
    template: "%s · KhaiBáo AI Admin",
    overview: "Operations overview",
    announcements: "System announcements",
    audit: "Admin audit log",
    exchangeRates: "Customs exchange rates",
    integrations: "Shared integrations",
    orgs: "Organizations",
    plans: "Plans",
    skillTemplates: "Skill templates",
    staff: "Admins",
    system: "System health",
    usage: "Usage & cost",
    users: "Users",
  },
  zh: {
    root: "系统管理",
    template: "%s · KhaiBáo AI 管理",
    overview: "运营概览",
    announcements: "系统通知",
    audit: "管理日志",
    exchangeRates: "计税汇率",
    integrations: "共享集成",
    orgs: "企业",
    plans: "套餐",
    skillTemplates: "技能模板",
    staff: "管理员",
    system: "系统健康",
    usage: "用量与成本",
    users: "用户",
  },
};

/** Tiêu đề dùng cho metadata (máy chủ) – xem ghi chú đầu file. */
export const ADMIN_TITLES = ADMIN_TITLE_MESSAGES.vi;
