// Cách hiển thị các mã của back-office (dùng chung cho mọi màn /admin). Nhãn + màu trạng thái lấy từ StatusBadge của @kb/ui.
import type {
  AdminAction, AdminPermission, AdminTargetType, AdminUserStatus, AnnouncementAudience, AnnouncementKind, IntegrationStatus, OrgStatus,
  PlanCode, ServiceStatus, SkillKind, StaffRole,
} from "@kb/contracts";
import { STATUS_META, type Status, type Tone } from "@kb/ui";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = { SUPER_ADMIN: "Quản trị cấp cao", SUPPORT: "Hỗ trợ", READONLY: "Chỉ xem" };
export const STAFF_ROLE_ORDER: StaffRole[] = ["SUPER_ADMIN", "SUPPORT", "READONLY"];

/** Bảng "vai trò làm được gì" – mỗi dòng ứng với một quyền trong STAFF_PERMISSIONS của @kb/contracts. */
export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  VIEW: "Xem mọi màn và báo cáo",
  SUPPORT: "Khóa/mở doanh nghiệp, người dùng; đặt lại mật khẩu; chạy lại job; gửi thông báo",
  BILLING: "Đổi gói, nới hạn mức, sửa danh mục gói",
  PLATFORM: "Cập nhật khóa API tích hợp, phát hành skill mẫu",
  STAFF: "Mời, đổi vai trò, khóa quản trị viên",
};
export const PERMISSION_ORDER: AdminPermission[] = ["VIEW", "SUPPORT", "BILLING", "PLATFORM", "STAFF"];

export const ACCOUNT_STATUS = {
  ACTIVE: "ACCOUNT_ACTIVE",
  INVITED: "ACCOUNT_INVITED",
  DISABLED: "ACCOUNT_DISABLED",
  PENDING_JOIN: "ACCOUNT_PENDING_JOIN",
} as const satisfies Record<AdminUserStatus, Status>;

export const ORG_STATUS = { ACTIVE: "ORG_ACTIVE", SUSPENDED: "ORG_SUSPENDED" } as const satisfies Record<OrgStatus, Status>;

export const INTEGRATION_STATUS = {
  CONNECTED: "INTEGRATION_CONNECTED",
  ERROR: "INTEGRATION_ERROR",
  NOT_CONFIGURED: "INTEGRATION_NOT_CONFIGURED",
} as const satisfies Record<IntegrationStatus, Status>;

export const SERVICE_STATUS = { UP: "SERVICE_UP", DEGRADED: "SERVICE_DEGRADED", DOWN: "SERVICE_DOWN" } as const satisfies Record<ServiceStatus, Status>;

/** Nhãn tiếng Việt của một trạng thái – cho ô lọc/tìm kiếm của bảng (khớp đúng chữ trên StatusBadge). */
export const statusLabel = (s: Status) => STATUS_META[s].label;

/** Gói là nhãn phân loại (Badge), không phải trạng thái nghiệp vụ. */
export const PLAN_TONE: Record<PlanCode, Tone> = { TRIAL: "neutral", BASIC: "info", PRO: "primary", ENTERPRISE: "success" };

export const SKILL_KIND_LABELS: Record<SkillKind, string> = { DOCUMENT: "Đọc chứng từ", SUPPLIER: "Theo nhà cung cấp", MAPPING: "Ánh xạ tờ khai" };

export const ANNOUNCEMENT_KIND_LABELS: Record<AnnouncementKind, string> = { INFO: "Thông tin", MAINTENANCE: "Bảo trì" };

export const audienceLabel = (audience: AnnouncementAudience, planNames: Partial<Record<PlanCode, string>> = {}) =>
  audience === "ALL" ? "Mọi doanh nghiệp" : `Gói ${planNames[audience] ?? audience}`;

export const ACTION_LABELS: Record<AdminAction, string> = {
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
};

export const TARGET_TYPE_LABELS: Record<AdminTargetType, string> = {
  ORG: "Doanh nghiệp",
  USER: "Người dùng",
  PLAN: "Gói",
  INTEGRATION: "Tích hợp",
  JOB: "Job",
  SKILL_TEMPLATE: "Skill mẫu",
  STAFF: "Quản trị viên",
  ANNOUNCEMENT: "Thông báo",
};

/** Ngưỡng cảnh báo hạn mức – cùng mốc với mục "Cần chú ý" ở màn tổng quan. */
const QUOTA_WARN = 0.9;

export type QuotaState = { ratio: number; percent: number; tone: "primary" | "warning" | "danger"; label: string };

/** Mức dùng hạn mức hồ sơ trong tháng. `limit` đã gồm phần nới tạm. Luôn có chữ đi kèm màu. */
export function quotaState(used: number, limit: number): QuotaState {
  if (limit <= 0) return { ratio: 0, percent: 0, tone: "primary", label: "Không giới hạn" };
  const ratio = used / limit;
  const percent = Math.round(ratio * 100);
  if (ratio >= 1) return { ratio, percent, tone: "danger", label: ratio > 1 ? "Vượt hạn mức" : "Hết hạn mức" };
  if (ratio >= QUOTA_WARN) return { ratio, percent, tone: "warning", label: "Sắp hết hạn mức" };
  return { ratio, percent, tone: "primary", label: "Trong hạn mức" };
}

/** "2026-10" → "Tháng 10/2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return y && m ? `Tháng ${Number(m)}/${y}` : month;
}
