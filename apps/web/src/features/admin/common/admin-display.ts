// Cách hiển thị các mã của back-office (dùng chung cho mọi màn /admin). Nhãn + màu trạng thái lấy từ StatusBadge của @kb/ui.
import type {
  AdminPermission, AdminUserStatus, AnnouncementAudience, IntegrationStatus, OrgStatus, PlanCode, ServiceStatus, StaffRole,
} from "@kb/contracts";
import { fill, pickMessages, statusLabel as uiStatusLabel, type Status, type Tone, type UiLocale } from "@kb/ui";
import { ADMIN_DISPLAY_MESSAGES } from "./admin-display.messages";

export {
  ACTION_LABELS, ANNOUNCEMENT_KIND_LABELS, PERMISSION_LABELS, SKILL_KIND_LABELS, STAFF_ROLE_LABELS, TARGET_TYPE_LABELS,
} from "./admin-display.messages";

/** Giữ tên kiểu cũ cho nơi gọi: mọi trạng thái của StatusBadge. */
export type AdminStatus = Status;

export const STAFF_ROLE_ORDER: StaffRole[] = ["SUPER_ADMIN", "SUPPORT", "READONLY"];

/** Bảng "vai trò làm được gì" – mỗi dòng ứng với một quyền trong STAFF_PERMISSIONS của @kb/contracts (nhãn: PERMISSION_LABELS). */
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

/** Nhãn của một trạng thái theo ngôn ngữ – cho ô lọc/tìm kiếm của bảng (khớp chữ trên StatusBadge). */
export const statusLabel = (s: Status, locale: UiLocale = "vi") => uiStatusLabel(s, locale);

/** Gói là nhãn phân loại (Badge), không phải trạng thái nghiệp vụ. */
export const PLAN_TONE: Record<PlanCode, Tone> = { TRIAL: "neutral", BASIC: "info", PRO: "primary", ENTERPRISE: "success" };

export const audienceLabel = (audience: AnnouncementAudience, planNames: Partial<Record<PlanCode, string>> = {}, locale: UiLocale = "vi") => {
  const t = pickMessages(ADMIN_DISPLAY_MESSAGES, locale);
  return audience === "ALL" ? t.audienceAll : fill(t.audiencePlan, { plan: planNames[audience] ?? audience });
};

/** Ngưỡng cảnh báo hạn mức – cùng mốc với mục "Cần chú ý" ở màn tổng quan. */
const QUOTA_WARN = 0.9;

export type QuotaState = { ratio: number; percent: number; tone: "primary" | "warning" | "danger"; label: string };

/** Mức dùng hạn mức hồ sơ trong tháng. `limit` đã gồm phần nới tạm. Luôn có chữ đi kèm màu. */
export function quotaState(used: number, limit: number, locale: UiLocale = "vi"): QuotaState {
  const t = pickMessages(ADMIN_DISPLAY_MESSAGES, locale);
  if (limit <= 0) return { ratio: 0, percent: 0, tone: "primary", label: t.unlimited };
  const ratio = used / limit;
  const percent = Math.round(ratio * 100);
  if (ratio >= 1) return { ratio, percent, tone: "danger", label: ratio > 1 ? t.overQuota : t.quotaExhausted };
  if (ratio >= QUOTA_WARN) return { ratio, percent, tone: "warning", label: t.nearQuota };
  return { ratio, percent, tone: "primary", label: t.withinQuota };
}

/** "2026-10" → "Tháng 10/2026" (vi). */
export function monthLabel(month: string, locale: UiLocale = "vi"): string {
  const [y, m] = month.split("-");
  return y && m ? fill(pickMessages(ADMIN_DISPLAY_MESSAGES, locale).month, { m: Number(m), y }) : month;
}
