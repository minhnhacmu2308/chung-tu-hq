// Fake cho test use case: giữ dữ liệu trong mảng, mô phỏng RLS bằng cách lọc theo org/user của ngữ cảnh.
import type { OrgId, UserId } from "../../../../shared/ids.js";
import type {
  AuthTokenRow, CertificateRow, IdentityRepos, IdentityUow, JoinRequestRow, JoinRequestStatus, MembershipRow, NotificationRow, OrgRow,
  PlanRow, PlansReader, SessionRow, UserRow,
} from "../ports.js";

export type MemoryData = {
  users: UserRow[];
  orgs: OrgRow[];
  memberships: MembershipRow[];
  sessions: SessionRow[];
  authTokens: AuthTokenRow[];
  joinRequests: JoinRequestRow[];
  certificates: CertificateRow[];
  notifications: NotificationRow[];
  plans: PlanRow[];
};

type Scope = { kind: "system" } | { kind: "user"; userId: string } | { kind: "org"; orgId: string; userId: string };

export class InMemoryIdentityUow implements IdentityUow, PlansReader {
  readonly data: MemoryData = { users: [], orgs: [], memberships: [], sessions: [], authTokens: [], joinRequests: [], certificates: [], notifications: [], plans: [] };

  seed(partial: Partial<MemoryData>) {
    for (const k of Object.keys(partial) as (keyof MemoryData)[]) (this.data[k] as unknown[]).push(...(partial[k] as unknown[]));
    return this;
  }
  async get(code: string) {
    return this.data.plans.find((p) => p.code === code) ?? null;
  }
  system<T>(fn: (r: IdentityRepos) => Promise<T>) {
    return fn(this.repos({ kind: "system" }));
  }
  asUser<T>(userId: UserId, fn: (r: IdentityRepos) => Promise<T>) {
    return fn(this.repos({ kind: "user", userId }));
  }
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: IdentityRepos) => Promise<T>) {
    return fn(this.repos({ kind: "org", orgId: ctx.orgId, userId: ctx.userId }));
  }

  /** Mô phỏng policy RLS thật (xem db/schema/identity.ts). Vi phạm ghi → ném lỗi như Postgres. */
  private repos(scope: Scope): IdentityRepos {
    const d = this.data;
    const isSystem = scope.kind === "system";
    const orgOk = (orgId: string) => scope.kind === "org" && scope.orgId === orgId;
    const userOk = (userId: string) => scope.kind !== "system" && scope.userId === userId;
    const deny = (what: string): never => {
      throw new Error(`new row violates row-level security policy (${what}, scope=${scope.kind})`);
    };
    const clone = <T>(x: T): T => structuredClone(x);
    // users_read: chính mình | thành viên cùng org đang đặt | không ngữ cảnh
    const canSeeUser = (id: string) =>
      isSystem ||
      userOk(id) ||
      (scope.kind === "org" && (d.memberships.some((m) => m.orgId === scope.orgId && m.userId === id) || d.joinRequests.some((j) => j.orgId === scope.orgId && j.userId === id && j.status === "PENDING")));
    // memberships: org đang đặt | (không có org && của chính user)
    const canSeeMembership = (m: MembershipRow) => orgOk(m.orgId) || (scope.kind === "user" && m.userId === scope.userId);
    const canSeeOrg = (id: string) => isSystem || orgOk(id) || (scope.kind === "user" && d.memberships.some((m) => m.userId === scope.userId && m.orgId === id));
    return {
      users: {
        findByEmail: async (email) => clone(d.users.find((u) => u.email === email && canSeeUser(u.id)) ?? null),
        findById: async (id) => clone(d.users.find((u) => u.id === id && canSeeUser(u.id)) ?? null),
        findByIds: async (ids) => clone(d.users.filter((u) => ids.includes(u.id) && canSeeUser(u.id))),
        insert: async (row) => void (isSystem ? d.users.push(clone(row)) : deny("users insert")),
        update: async (id, patch) => void (userOk(id) ? Object.assign(d.users.find((u) => u.id === id) ?? {}, patch) : deny("users update")),
      },
      orgs: {
        findByTaxCode: async (t) => clone(d.orgs.find((o) => o.taxCode === t && canSeeOrg(o.id)) ?? null),
        findById: async (id) => clone(d.orgs.find((o) => o.id === id && canSeeOrg(id)) ?? null),
        listAll: async () => clone(isSystem ? d.orgs : d.orgs.filter((o) => canSeeOrg(o.id))),
        insert: async (row) => void (isSystem ? d.orgs.push(clone(row)) : deny("organizations insert")),
        update: async (id, patch) => void (orgOk(id) ? Object.assign(d.orgs.find((o) => o.id === id) ?? {}, patch) : deny("organizations update")),
      },
      memberships: {
        listByOrg: async (orgId) => clone(d.memberships.filter((m) => m.orgId === orgId && canSeeMembership(m))),
        listByUser: async (userId) => clone(d.memberships.filter((m) => m.userId === userId && canSeeMembership(m))),
        find: async (orgId, userId) => clone(d.memberships.find((m) => m.orgId === orgId && m.userId === userId && canSeeMembership(m)) ?? null),
        insert: async (row) => void (orgOk(row.orgId) ? d.memberships.push(clone(row)) : deny("memberships insert")),
        update: async (id, patch) => {
          const m = d.memberships.find((x) => x.id === id);
          if (!m || !orgOk(m.orgId)) return deny("memberships update");
          Object.assign(m, patch);
        },
      },
      sessions: {
        findByTokenHash: async (h) => clone(d.sessions.find((s) => s.tokenHash === h && (isSystem || userOk(s.userId))) ?? null),
        insert: async (row) => void (isSystem || userOk(row.userId) ? d.sessions.push(clone(row)) : deny("sessions insert")),
        touch: async (id, lastSeenAt, expiresAt) => {
          const s = d.sessions.find((x) => x.id === id);
          if (!s || !(isSystem || userOk(s.userId))) return;
          Object.assign(s, { lastSeenAt, expiresAt });
        },
        delete: async (id) => void (d.sessions = d.sessions.filter((s) => !(s.id === id && (isSystem || userOk(s.userId))))),
        lastSeenByUsers: async (ids) => {
          const out: Record<string, Date> = {};
          for (const s of d.sessions) if (ids.includes(s.userId) && (isSystem || userOk(s.userId)) && (!out[s.userId] || out[s.userId]! < s.lastSeenAt)) out[s.userId] = s.lastSeenAt;
          return out;
        },
      },
      authTokens: {
        findValid: async (kind, hash, now) => clone(d.authTokens.find((t) => t.kind === kind && t.tokenHash === hash && t.usedAt === null && t.expiresAt > now && (isSystem || userOk(t.userId))) ?? null),
        insert: async (row) => void (isSystem || userOk(row.userId) ? d.authTokens.push(clone(row)) : deny("auth_tokens insert")),
        markUsed: async (id, at) => {
          const t = d.authTokens.find((x) => x.id === id);
          if (!t || !(isSystem || userOk(t.userId))) return;
          t.usedAt = at;
        },
      },
      joinRequests: {
        listPending: async (orgId) => clone(d.joinRequests.filter((j) => j.orgId === orgId && j.status === "PENDING" && (isSystem || orgOk(orgId) || userOk(j.userId)))),
        findPendingByUser: async (userId) => clone(d.joinRequests.filter((j) => j.userId === userId && j.status === "PENDING" && (isSystem || orgOk(j.orgId) || userOk(userId)))),
        findById: async (id) => clone(d.joinRequests.find((j) => j.id === id && (isSystem || orgOk(j.orgId) || userOk(j.userId))) ?? null),
        insert: async (row) => void (isSystem || userOk(row.userId) ? d.joinRequests.push(clone(row)) : deny("join_requests insert")),
        decide: async (id, status: JoinRequestStatus) => {
          const j = d.joinRequests.find((x) => x.id === id);
          if (!j || !orgOk(j.orgId)) return deny("join_requests update");
          j.status = status;
        },
      },
      certificates: {
        list: async (orgId) => clone(orgOk(orgId) ? d.certificates.filter((c) => c.orgId === orgId) : []),
        insert: async (row) => void (orgOk(row.orgId) ? d.certificates.push(clone(row)) : deny("digital_certificates insert")),
        setDefault: async (orgId, id) => {
          if (!orgOk(orgId)) return;
          for (const c of d.certificates) if (c.orgId === orgId) c.isDefault = c.id === id;
        },
        delete: async (orgId, id) => void (d.certificates = d.certificates.filter((c) => !(c.orgId === orgId && c.id === id && orgOk(orgId)))),
      },
      notifications: {
        list: async (orgId, userId) => clone(orgOk(orgId) && userOk(userId) ? d.notifications.filter((n) => n.orgId === orgId && n.userId === userId) : []),
        insert: async (row) => void (orgOk(row.orgId) ? d.notifications.push(clone(row)) : deny("notifications insert")),
        markAllRead: async (orgId, userId, at) => {
          for (const n of d.notifications) if (n.orgId === orgId && n.userId === userId && orgOk(orgId) && userOk(userId)) n.readAt = at;
        },
      },
    };
  }
}
