import type { Role } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { AuthTokenKind } from "../domain/token.js";

export type UserRow = { id: string; email: string; passwordHash: string; name: string; emailVerifiedAt: Date | null; createdAt: Date };
export type OrgRow = {
  id: string; taxCode: string; name: string; address: string; phone: string; planCode: string; suspectThreshold: string; fourEyes: boolean; createdAt: Date;
  /** Do khu Quản trị hệ thống đặt (module admin); thiếu = mặc định của DB. */
  status?: string; quotaBonus?: number; quotaBonusMonth?: string | null; planStartedAt?: Date | null; trialEndsAt?: Date | null;
};
export type MembershipStatus = "ACTIVE" | "INVITED" | "DISABLED";
export type MembershipRow = { id: string; orgId: string; userId: string; role: Role; status: MembershipStatus; invitedBy: string | null };
export type SessionRow = { id: string; userId: string; orgId: string | null; tokenHash: string; expiresAt: Date; lastSeenAt: Date };
export type AuthTokenRow = { id: string; userId: string; orgId: string | null; kind: AuthTokenKind; tokenHash: string; expiresAt: Date; usedAt: Date | null };
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type JoinRequestRow = { id: string; orgId: string; userId: string; status: JoinRequestStatus; createdAt: Date };
export type CertificateRow = { id: string; orgId: string; subject: string; issuer: string; serial: string; validTo: string; isDefault: boolean };
export type NotificationRow = { id: string; orgId: string; userId: string; title: string; body: string; href: string | null; readAt: Date | null; createdAt: Date };
export type PlanRow = { code: string; name: string; dossiersPerMonth: number; pagesPerDossier: number };

export interface IdentityRepos {
  users: {
    findByEmail(email: string): Promise<UserRow | null>;
    findById(id: string): Promise<UserRow | null>;
    findByIds(ids: string[]): Promise<UserRow[]>;
    insert(row: UserRow): Promise<void>;
    update(id: string, patch: Partial<Pick<UserRow, "name" | "passwordHash" | "emailVerifiedAt">>): Promise<void>;
  };
  orgs: {
    findByTaxCode(taxCode: string): Promise<OrgRow | null>;
    findById(id: string): Promise<OrgRow | null>;
    /** Mọi org (chỉ dùng trong ngữ cảnh hệ thống: job định kỳ). */
    listAll(): Promise<OrgRow[]>;
    insert(row: OrgRow): Promise<void>;
    update(id: string, patch: Partial<Pick<OrgRow, "name" | "address" | "phone" | "suspectThreshold" | "fourEyes" | "planCode">>): Promise<void>;
  };
  memberships: {
    listByOrg(orgId: string): Promise<MembershipRow[]>;
    listByUser(userId: string): Promise<MembershipRow[]>;
    find(orgId: string, userId: string): Promise<MembershipRow | null>;
    insert(row: MembershipRow): Promise<void>;
    update(id: string, patch: Partial<Pick<MembershipRow, "role" | "status">>): Promise<void>;
  };
  sessions: {
    findByTokenHash(hash: string): Promise<SessionRow | null>;
    insert(row: SessionRow): Promise<void>;
    touch(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
    delete(id: string): Promise<void>;
    lastSeenByUsers(userIds: string[]): Promise<Record<string, Date>>;
  };
  authTokens: {
    findValid(kind: AuthTokenKind, hash: string, now: Date): Promise<AuthTokenRow | null>;
    insert(row: AuthTokenRow): Promise<void>;
    markUsed(id: string, at: Date): Promise<void>;
  };
  joinRequests: {
    listPending(orgId: string): Promise<JoinRequestRow[]>;
    findPendingByUser(userId: string): Promise<JoinRequestRow[]>;
    findById(id: string): Promise<JoinRequestRow | null>;
    insert(row: JoinRequestRow): Promise<void>;
    decide(id: string, status: JoinRequestStatus, decidedBy: string, at: Date): Promise<void>;
  };
  certificates: {
    list(orgId: string): Promise<CertificateRow[]>;
    insert(row: CertificateRow): Promise<void>;
    setDefault(orgId: string, id: string): Promise<void>;
    delete(orgId: string, id: string): Promise<void>;
  };
  notifications: {
    list(orgId: string, userId: string): Promise<NotificationRow[]>;
    insert(row: NotificationRow): Promise<void>;
    markAllRead(orgId: string, userId: string, at: Date): Promise<void>;
  };
}

/** Đơn vị công việc: mỗi lời gọi là một transaction với ngữ cảnh RLS tương ứng. */
export interface IdentityUow {
  system<T>(fn: (r: IdentityRepos) => Promise<T>): Promise<T>;
  asUser<T>(userId: UserId, fn: (r: IdentityRepos) => Promise<T>): Promise<T>;
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: IdentityRepos) => Promise<T>): Promise<T>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
export interface RateLimiter {
  hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }>;
  /** Xóa bộ đếm (vd. đăng nhập đúng mật khẩu → không tính các lần trước). */
  reset(key: string): Promise<void>;
}
export interface Mailer {
  send(msg: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}
export interface SecretStore {
  encrypt(plain: string): { ciphertext: string; keyVersion: number };
  decrypt(ciphertext: string, keyVersion: number): string;
}
export interface TaxRegistryLookup {
  lookup(taxCode: string): Promise<{ found: false } | { found: true; name: string; address: string }>;
}
export interface PlansReader {
  get(code: string): Promise<PlanRow | null>;
}

export type IdentityDeps = {
  uow: IdentityUow;
  plans: PlansReader;
  hasher: PasswordHasher;
  rateLimiter: RateLimiter;
  mailer: Mailer;
  taxRegistry: TaxRegistryLookup;
  clock: Clock;
  idGen: IdGen;
  appUrl: string;
  random?: (n: number) => Buffer;
  /** Sau khi tạo org mới (đăng ký MST mới): composition root nối việc sao chép skill mẫu… Lỗi ở đây không làm hỏng đăng ký. */
  onOrgCreated?: (org: { orgId: string; userId: string }) => Promise<void>;
  /** Tài khoản có quyền quản trị hệ thống không (module admin cung cấp qua container, ADR 0006); thiếu → không ai là quản trị viên. */
  platformStaff?: (userId: string) => Promise<{ status: "ACTIVE" | "INVITED" | "DISABLED" } | null>;
  /** Mức dùng tháng của org (billing cung cấp qua container); thiếu → 0. */
  usage?: (orgId: string) => Promise<{ dossiersThisMonth: number; pagesThisMonth: number; aiCostVnd: string }>;
};
