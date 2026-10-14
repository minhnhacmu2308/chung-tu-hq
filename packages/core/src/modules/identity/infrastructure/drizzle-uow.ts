// Hiện thực IdentityUow bằng Drizzle: mỗi lời gọi là một transaction với ngữ cảnh RLS (withSystem/withUser/withCtx).
import { and, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { authTokens, digitalCertificates, joinRequests, memberships, notifications, organizations, sessions, users } from "../../../db/schema/identity.js";
import { withCtx, withSystem, withUser } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { IdentityRepos, IdentityUow, JoinRequestStatus, MembershipRow, MembershipStatus } from "../application/ports.js";
import type { AuthTokenKind } from "../domain/token.js";
import type { Role } from "@kb/contracts";

function repos(tx: Tx): IdentityRepos {
  const toMembership = (m: typeof memberships.$inferSelect): MembershipRow => ({ id: m.id, orgId: m.orgId, userId: m.userId, role: m.role as Role, status: m.status as MembershipStatus, invitedBy: m.invitedBy });
  return {
    users: {
      findByEmail: async (email) => (await tx.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null,
      findById: async (id) => (await tx.select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null,
      findByIds: async (ids) => (ids.length ? tx.select().from(users).where(inArray(users.id, ids)) : []),
      insert: async (row) => void (await tx.insert(users).values(row)),
      update: async (id, patch) => void (await tx.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id))),
    },
    orgs: {
      findByTaxCode: async (taxCode) => (await tx.select().from(organizations).where(eq(organizations.taxCode, taxCode)).limit(1))[0] ?? null,
      findById: async (id) => (await tx.select().from(organizations).where(eq(organizations.id, id)).limit(1))[0] ?? null,
      listAll: async () => tx.select().from(organizations).orderBy(organizations.id),
      insert: async (row) => void (await tx.insert(organizations).values(row)),
      update: async (id, patch) => void (await tx.update(organizations).set({ ...patch, updatedAt: new Date() }).where(eq(organizations.id, id))),
    },
    memberships: {
      listByOrg: async (orgId) => (await tx.select().from(memberships).where(eq(memberships.orgId, orgId)).orderBy(memberships.createdAt)).map(toMembership),
      listByUser: async (userId) => (await tx.select().from(memberships).where(eq(memberships.userId, userId)).orderBy(memberships.createdAt)).map(toMembership),
      find: async (orgId, userId) => {
        const m = (await tx.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId))).limit(1))[0];
        return m ? toMembership(m) : null;
      },
      insert: async (row) => void (await tx.insert(memberships).values(row)),
      update: async (id, patch) => void (await tx.update(memberships).set({ ...patch, updatedAt: new Date() }).where(eq(memberships.id, id))),
    },
    sessions: {
      findByTokenHash: async (h) => (await tx.select().from(sessions).where(eq(sessions.tokenHash, h)).limit(1))[0] ?? null,
      insert: async (row) => void (await tx.insert(sessions).values(row)),
      touch: async (id, lastSeenAt, expiresAt) => void (await tx.update(sessions).set({ lastSeenAt, expiresAt }).where(eq(sessions.id, id))),
      delete: async (id) => void (await tx.delete(sessions).where(eq(sessions.id, id))),
      lastSeenByUsers: async (ids) => {
        if (!ids.length) return {};
        // Bảng sessions chỉ lộ dòng của chính user trong ngữ cảnh org → dùng hàm SECURITY DEFINER? Không: chấp nhận chỉ biết "lần hoạt động" của người đang đăng nhập; phần còn lại lấy từ users.updated_at (xem ghi chú BACKEND-TODO).
        const rows = await tx.select({ userId: sessions.userId, last: max(sessions.lastSeenAt) }).from(sessions).where(inArray(sessions.userId, ids)).groupBy(sessions.userId);
        const out: Record<string, Date> = {};
        for (const r of rows) if (r.last) out[r.userId] = r.last;
        return out;
      },
    },
    authTokens: {
      findValid: async (kind: AuthTokenKind, hash, now) =>
        ((await tx.select().from(authTokens).where(and(eq(authTokens.kind, kind), eq(authTokens.tokenHash, hash), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now))).limit(1))[0] as
          | (typeof authTokens.$inferSelect & { kind: AuthTokenKind })
          | undefined) ?? null,
      insert: async (row) => void (await tx.insert(authTokens).values(row)),
      markUsed: async (id, at) => void (await tx.update(authTokens).set({ usedAt: at }).where(eq(authTokens.id, id))),
    },
    joinRequests: {
      listPending: async (orgId) => (await tx.select().from(joinRequests).where(and(eq(joinRequests.orgId, orgId), eq(joinRequests.status, "PENDING"))).orderBy(joinRequests.createdAt)).map(toJoin),
      findPendingByUser: async (userId) => (await tx.select().from(joinRequests).where(and(eq(joinRequests.userId, userId), eq(joinRequests.status, "PENDING")))).map(toJoin),
      findById: async (id) => {
        const j = (await tx.select().from(joinRequests).where(eq(joinRequests.id, id)).limit(1))[0];
        return j ? toJoin(j) : null;
      },
      insert: async (row) => void (await tx.insert(joinRequests).values(row)),
      decide: async (id, status: JoinRequestStatus, decidedBy, at) => void (await tx.update(joinRequests).set({ status, decidedBy, decidedAt: at, updatedAt: at }).where(eq(joinRequests.id, id))),
    },
    certificates: {
      list: async (orgId) => tx.select().from(digitalCertificates).where(eq(digitalCertificates.orgId, orgId)).orderBy(digitalCertificates.createdAt, digitalCertificates.id),
      insert: async (row) => void (await tx.insert(digitalCertificates).values(row)),
      setDefault: async (orgId, id) => {
        await tx.update(digitalCertificates).set({ isDefault: sql`(${digitalCertificates.id} = ${id})`, updatedAt: new Date() }).where(eq(digitalCertificates.orgId, orgId));
      },
      delete: async (orgId, id) => void (await tx.delete(digitalCertificates).where(and(eq(digitalCertificates.orgId, orgId), eq(digitalCertificates.id, id)))),
    },
    notifications: {
      list: async (orgId, userId) => tx.select().from(notifications).where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId))).orderBy(desc(notifications.createdAt)).limit(50),
      insert: async (row) => void (await tx.insert(notifications).values(row)),
      markAllRead: async (orgId, userId, at) => void (await tx.update(notifications).set({ readAt: at }).where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), isNull(notifications.readAt)))),
    },
  };
}

const toJoin = (j: typeof joinRequests.$inferSelect) => ({ id: j.id, orgId: j.orgId, userId: j.userId, status: j.status as JoinRequestStatus, createdAt: j.createdAt });

export class DrizzleIdentityUow implements IdentityUow {
  constructor(private db: Db) {}
  system<T>(fn: (r: IdentityRepos) => Promise<T>) {
    return withSystem(this.db, (tx) => fn(repos(tx)));
  }
  asUser<T>(userId: UserId, fn: (r: IdentityRepos) => Promise<T>) {
    return withUser(this.db, userId, (tx) => fn(repos(tx)));
  }
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: IdentityRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
