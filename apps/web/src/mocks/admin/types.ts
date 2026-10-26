// Phần dữ liệu back-office trong "DB" giả. Doanh nghiệp demo (db.org + db.members) được ghép vào lúc đọc,
// nên thao tác ở /admin (đổi gói, khóa người dùng, gửi thông báo) hiện ngay bên ứng dụng của khách.
import type {
  ExchangeRate, ExchangeRateFetch,
  AdminAuditEntry, AdminPlan, AdminUser, AdminUserSession, Announcement, FailedJob, IntegrationId, Organization, OrgStatus,
  PlatformIntegration, QueueStat, ServiceHealth, SkillTemplate, Staff,
} from "@kb/contracts";

export type OrgMeta = {
  status: OrgStatus; suspendedReason?: string; quotaBonus: number; createdAt: string;
  /** Doanh nghiệp quản trị tạo hộ (ký hợp đồng trực tiếp). */
  contract?: { contractNo?: string; endsOn?: string; note?: string };
};
export type StoredOrg = { org: Organization; meta: OrgMeta };
export type StoredUser = Omit<AdminUser, "orgName">;
export type UserMeta = { emailVerified: boolean; createdAt: string; sessions: AdminUserSession[] };
export type StoredPlan = Omit<AdminPlan, "orgCount">;

export type AdminDb = {
  /** null = chưa đăng nhập back-office. */
  currentStaffId: string | null;
  staff: Staff[];
  /** Trạng thái quản trị của doanh nghiệp demo (bản thân doanh nghiệp nằm ở db.org). */
  demoOrgMeta: OrgMeta;
  /** Thông tin thêm của thành viên doanh nghiệp demo, theo id trong db.members. */
  demoUserMeta: Record<string, UserMeta>;
  orgs: StoredOrg[];
  users: StoredUser[];
  plans: StoredPlan[];
  integrations: PlatformIntegration[];
  /** Tích hợp có khóa đã hỏng: bấm Kiểm tra vẫn lỗi cho tới khi cập nhật khóa. */
  brokenKeys: IntegrationId[];
  services: ServiceHealth[];
  queues: QueueStat[];
  failedJobs: FailedJob[];
  skillTemplates: SkillTemplate[];
  /** Tỷ giá tính thuế theo tuần (D2) + nhật ký lần lấy Vietcombank. */
  exchangeRates: ExchangeRate[];
  rateFetches: ExchangeRateFetch[];
  /** Mới nhất đứng đầu. */
  audit: AdminAuditEntry[];
  announcements: Announcement[];
  /** Thông báo hệ thống → thông báo đã đẩy vào panel của doanh nghiệp demo (để thu hồi). */
  announcementNotifications: Record<string, string>;
};
