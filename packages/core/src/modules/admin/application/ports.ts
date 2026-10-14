// Port của module admin (khu Quản trị hệ thống, ADR 0006). Hạ tầng dùng kết nối kb_platform – đọc xuyên doanh nghiệp,
// nên CHỈ trả số liệu tổng hợp và thông tin tài khoản; không port nào đọc nội dung hồ sơ/chứng từ/tờ khai.
import type { IntegrationId, Role, ServiceHealth, StaffRole } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen } from "../../../shared/ids.js";
import type { Result } from "../../../shared/result.js";
import type { StaffStatus } from "../domain/staff-rules.js";

export type StaffRow = { userId: string; name: string; email: string; role: StaffRole; status: StaffStatus; lastActiveAt: Date | null; createdAt: Date; mfaEnabled: boolean };
/** Khóa 2FA (mã hóa) của một quản trị viên. */
export type StaffMfaRow = {
  totpCiphertext: string | null; totpPendingCiphertext: string | null; totpKeyVersion: number; totpEnabledAt: Date | null; totpLastCounter: number | null; recoveryCodes: string[];
};
export type AdminOrgRow = {
  id: string; name: string; taxCode: string; address: string; phone: string; planCode: string;
  status: "ACTIVE" | "SUSPENDED"; suspendedReason: string | null; quotaBonus: number; quotaBonusMonth: string | null;
  planStartedAt: Date | null; trialEndsAt: Date | null; createdAt: Date;
};
export type OrgPatch = Partial<Pick<AdminOrgRow, "status" | "suspendedReason" | "quotaBonus" | "quotaBonusMonth" | "planCode" | "planStartedAt" | "trialEndsAt">>;
export type PlanRow = { code: string; name: string; dossiersPerMonth: number; pagesPerDossier: number; priceVnd: string };
export type MemberRow = {
  userId: string; orgId: string; name: string; email: string; role: Role; status: "ACTIVE" | "INVITED" | "DISABLED";
  emailVerified: boolean; createdAt: Date; lastSeenAt: Date | null;
};
export type JoinRow = { userId: string; orgId: string; name: string; email: string; emailVerified: boolean; createdAt: Date; requestedAt: Date };
export type SessionInfo = { id: string; userId: string; orgId: string | null; ip: string | null; userAgent: string | null; lastSeenAt: Date };
/** Số liệu một doanh nghiệp trong một khoảng thời gian. Tiền là chuỗi thập phân (Decimal). */
export type OrgUsage = { orgId: string; dossiers: number; pages: number; aiCalls: number; readCostVnd: string; hsCostVnd: string; customsCostVnd: string };
export type PlatformIntegrationRow = {
  id: IntegrationId; environment: "SANDBOX" | "PRODUCTION"; ciphertext: string | null; keyVersion: number; keyLast4: string | null; keyUpdatedAt: Date | null;
  status: "CONNECTED" | "ERROR" | "NOT_CONFIGURED"; detail: string | null; lastCheckedAt: Date | null;
};
export type TemplateRow = { id: string; code: string; name: string; kind: string; docKind: string | null; version: number; fieldCount: number; published: boolean; orgCount: number; updatedAt: Date };
export type AuditRow = {
  id: string; at: Date; staffId: string; staffName: string; action: string; targetType: string; targetId: string; targetLabel: string;
  orgId: string | null; orgName: string | null; reason: string; detail: string | null;
};
export type AnnouncementRow = {
  id: string; title: string; body: string; kind: string; audience: string; maintenanceDate: string | null; status: "SENT" | "WITHDRAWN";
  sentAt: Date; sentBy: string; sentByName: string; recipients: number;
};

export interface AdminRepos {
  staff: {
    get(userId: string): Promise<StaffRow | null>;
    list(): Promise<StaffRow[]>;
    insert(row: { userId: string; role: StaffRole; status: StaffStatus; invitedBy: string; at: Date }): Promise<void>;
    update(userId: string, patch: Partial<Pick<StaffRow, "role" | "status">>, at: Date): Promise<void>;
    getMfa(userId: string): Promise<StaffMfaRow | null>;
    setMfa(userId: string, patch: Partial<StaffMfaRow>, at: Date): Promise<void>;
  };
  sessions: {
    /** Phiên còn hạn theo hash token → user (+ đã qua bước xác thực 2 lớp chưa). */
    findValid(tokenHash: string, now: Date): Promise<{ id: string; userId: string; mfaVerifiedAt: Date | null } | null>;
    markMfaVerified(sessionId: string, at: Date): Promise<void>;
    listByUsers(userIds: string[], now: Date): Promise<SessionInfo[]>;
    /** Xóa phiên của user (chỉ phiên đang ở `orgId` nếu có); trả số phiên đã xóa. */
    deleteByUser(userId: string, orgId?: string): Promise<number>;
  };
  orgs: {
    list(): Promise<AdminOrgRow[]>;
    get(id: string): Promise<AdminOrgRow | null>;
    update(id: string, patch: OrgPatch, at: Date): Promise<void>;
  };
  members: {
    list(orgId?: string): Promise<MemberRow[]>;
    setStatus(orgId: string, userId: string, status: "ACTIVE" | "DISABLED"): Promise<void>;
    /** Thành viên đang hoạt động của các doanh nghiệp – người nhận thông báo hệ thống. */
    activeRecipients(orgIds: string[]): Promise<{ orgId: string; userId: string }[]>;
  };
  joins: { listPending(orgId?: string): Promise<JoinRow[]> };
  plans: {
    list(): Promise<PlanRow[]>;
    get(code: string): Promise<PlanRow | null>;
    update(code: string, patch: Omit<PlanRow, "code">, at: Date): Promise<void>;
  };
  usage: {
    /** Số liệu mọi doanh nghiệp trong [from, to): hồ sơ tạo mới, trang chứng từ, lượt gọi + giá vốn theo loại lệnh gọi trả phí. */
    byOrg(from: Date, to: Date): Promise<OrgUsage[]>;
  };
  orgConnections: {
    integrations(orgId: string): Promise<{ id: IntegrationId; status: string }[]>;
    certificates(orgId: string): Promise<{ id: string; issuer: string; validTo: string; isDefault: boolean }[]>;
  };
  platformIntegrations: {
    list(): Promise<PlatformIntegrationRow[]>;
    upsert(row: PlatformIntegrationRow, at: Date): Promise<void>;
  };
  templates: {
    list(): Promise<TemplateRow[]>;
    setPublished(id: string, published: boolean, at: Date): Promise<void>;
  };
  audit: {
    insert(row: AuditRow): Promise<void>;
    list(filter: { orgId?: string; limit: number }): Promise<AuditRow[]>;
  };
  announcements: {
    list(): Promise<AnnouncementRow[]>;
    get(id: string): Promise<AnnouncementRow | null>;
    insert(row: AnnouncementRow): Promise<void>;
    setStatus(id: string, status: "SENT" | "WITHDRAWN"): Promise<void>;
  };
  notifications: {
    insertMany(rows: { id: string; orgId: string; userId: string; title: string; body: string; announcementId: string; at: Date }[]): Promise<void>;
    deleteByAnnouncement(announcementId: string): Promise<number>;
  };
}

/** Một lời gọi = một transaction trên kết nối kb_platform (thao tác + dòng nhật ký cùng commit). */
export interface AdminUow {
  run<T>(fn: (r: AdminRepos) => Promise<T>): Promise<T>;
}

/** Việc thuộc module identity (ghi users/auth_tokens, gửi mail) – container nối tới use case của identity. */
export interface IdentityGateway {
  hashToken(raw: string): string;
  sendPasswordReset(email: string): Promise<Result<void>>;
  resendVerification(userId: string): Promise<Result<void>>;
  provisionAccount(input: { email: string; name: string }): Promise<Result<{ userId: string; created: boolean }>>;
}

/** Hàng đợi BullMQ – chỉ số đếm và job lỗi (không đọc payload ngoài orgId). */
export type FailedJobInfo = { id: string; queue: string; orgId: string | null; error: string | null; attempts: number; failedAt: Date };
export interface JobMonitor {
  stats(): Promise<{ queue: string; waiting: number; active: number; failed: number; completedToday: number }[]>;
  failed(limit: number): Promise<FailedJobInfo[]>;
  /** Chạy lại job lỗi; false = không còn job đó (đã chạy lại / đã xóa). */
  retry(queue: string, jobId: string): Promise<boolean>;
}

export interface SystemProbe {
  services(now: Date): Promise<ServiceHealth[]>;
}

/** Gọi thử nhà cung cấp với khóa (null = chưa có khóa). */
export interface IntegrationProbe {
  test(id: IntegrationId, apiKey: string | null): Promise<{ ok: boolean; detail: string }>;
}

export interface QrRenderer {
  /** Mã QR dạng SVG cho chuỗi (URI otpauth). */
  svg(text: string): Promise<string>;
}

/** Giới hạn số lần nhập sai mã 2FA (cùng hiện thực với giới hạn đăng nhập của identity). */
export interface AttemptLimiter {
  hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }>;
  reset(key: string): Promise<void>;
}

export interface KeyVault {
  encrypt(plain: string): { ciphertext: string; keyVersion: number };
  decrypt(ciphertext: string, keyVersion: number): string;
}

export type AdminDeps = {
  uow: AdminUow;
  identity: IdentityGateway;
  jobs: JobMonitor;
  system: SystemProbe;
  probe: IntegrationProbe;
  vault: KeyVault;
  qr: QrRenderer;
  limiter: AttemptLimiter;
  /** Byte ngẫu nhiên (khóa TOTP, mã khôi phục); test truyền hàm cố định. */
  random: (n: number) => Buffer;
  clock: Clock;
  idGen: IdGen;
};
