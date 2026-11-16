// Hiện thực IdentityUow bằng Drizzle: mỗi lời gọi là một transaction với ngữ cảnh RLS (withSystem/withUser/withCtx).
import { and, count, desc, eq, gt, ilike, inArray, isNull, max, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { authTokens, digitalCertificates, joinRequests, memberships, notifications, organizations, orgAudit, orgSecrets, sessions, users } from "../../../db/schema/identity.js";
import { withCtx, withSystem, withUser } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { CreditGrantRow, IdentityRepos, IdentityUow, JoinRequestStatus, MembershipRow, MembershipStatus, NotificationRow } from "../application/ports.js";

/**
 * Ghi dòng tặng lượt trong transaction đang mở – hiện thực thuộc billing (sổ lượt), composition root truyền vào
 * (identity không đọc/ghi bảng của module khác). Không nối → bỏ qua (test hạ tầng cũ).
 */
export type CreditGrantTx = (tx: Tx, row: CreditGrantRow) => Promise<void>;
import type { AuthTokenKind } from "../domain/token.js";
import { NotificationCategorySchema, notificationCategory, type Role } from "@kb/contracts";

function repos(tx: Tx, grant?: CreditGrantTx): IdentityRepos {
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
    credits: {
      grant: async (row) => {
        if (grant) await grant(tx, row);
      },
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
      deleteByUser: async (userId) => (await tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id })).length,
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
      consume: async (id, at) => (await tx.update(authTokens).set({ usedAt: at }).where(and(eq(authTokens.id, id), isNull(authTokens.usedAt))).returning({ id: authTokens.id })).length === 1,
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
        // Hai bước (bỏ mặc định cũ rồi đặt mới) để không vi phạm unique partial "một mặc định / doanh nghiệp" giữa chừng một câu UPDATE.
        await tx.update(digitalCertificates).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(digitalCertificates.orgId, orgId), eq(digitalCertificates.isDefault, true)));
        await tx.update(digitalCertificates).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(digitalCertificates.orgId, orgId), eq(digitalCertificates.id, id)));
      },
      delete: async (orgId, id) => void (await tx.delete(digitalCertificates).where(and(eq(digitalCertificates.orgId, orgId), eq(digitalCertificates.id, id)))),
    },
    secrets: {
      get: async (orgId, kind) => (await tx.select().from(orgSecrets).where(and(eq(orgSecrets.orgId, orgId), eq(orgSecrets.kind, kind))).limit(1))[0] ?? null,
      upsert: async (row) => {
        const { id, updatedAt, ...rest } = row;
        await tx.insert(orgSecrets).values({ id, ...rest, updatedAt }).onConflictDoUpdate({ target: [orgSecrets.orgId, orgSecrets.kind], set: { ciphertext: rest.ciphertext, keyVersion: rest.keyVersion, updatedAt } });
      },
      delete: async (orgId, kind) => void (await tx.delete(orgSecrets).where(and(eq(orgSecrets.orgId, orgId), eq(orgSecrets.kind, kind)))),
    },
    notifications: {
      list: async (orgId, userId) => (await tx.select().from(notifications).where(mineN(orgId, userId)).orderBy(desc(notifications.createdAt)).limit(50)).map(toNotification),
      page: async (orgId, userId, f) => {
        const conds = [mineN(orgId, userId)];
        // So theo mili giây: created_at mặc định của Postgres có micro giây, con trỏ (ISO của JS) chỉ tới mili giây.
        if (f.before) conds.push(sql`(${createdMs}, ${notifications.id}) < (${f.before.at.toISOString()}::timestamptz, ${f.before.id})`);
        if (f.unreadOnly) conds.push(isNull(notifications.readAt));
        if (f.category) conds.push(eq(notifications.category, f.category));
        if (f.q) {
          const pat = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
          conds.push(or(ilike(notifications.title, pat), ilike(notifications.body, pat))!);
        }
        const rows = await tx.select().from(notifications).where(and(...conds)).orderBy(desc(createdMs), desc(notifications.id)).limit(f.limit);
        return rows.map(toNotification);
      },
      countUnread: async (orgId, userId) => Number((await tx.select({ n: count() }).from(notifications).where(and(mineN(orgId, userId), isNull(notifications.readAt))))[0]?.n ?? 0),
      insert: async (row) => void (await tx.insert(notifications).values({ ...row, category: notificationCategory(row) })),
      markAllRead: async (orgId, userId, at) => void (await tx.update(notifications).set({ readAt: at }).where(and(mineN(orgId, userId), isNull(notifications.readAt)))),
      setRead: async (orgId, userId, id, at) => (await tx.update(notifications).set({ readAt: at }).where(and(mineN(orgId, userId), eq(notifications.id, id))).returning({ id: notifications.id })).length > 0,
      delete: async (orgId, userId, id) => (await tx.delete(notifications).where(and(mineN(orgId, userId), eq(notifications.id, id))).returning({ id: notifications.id })).length > 0,
    },
    audit: {
      insert: async (row) => void (await tx.insert(orgAudit).values(row)),
      list: async (orgId, page) => (await tx.select().from(orgAudit).where(eq(orgAudit.orgId, orgId)).orderBy(desc(orgAudit.at), desc(orgAudit.id)).limit(page.limit).offset(page.offset)).map((r) => ({ ...r, detail: (r.detail as Record<string, unknown> | null) ?? null })),
      count: async (orgId) => Number((await tx.select({ n: count() }).from(orgAudit).where(eq(orgAudit.orgId, orgId)))[0]?.n ?? 0),
    },
  };
}

const mineN = (orgId: string, userId: string) => and(eq(notifications.orgId, orgId), eq(notifications.userId, userId))!;
const createdMs = sql`date_trunc('milliseconds', ${notifications.createdAt})`;
const toNotification = (n: typeof notifications.$inferSelect): NotificationRow => ({
  id: n.id, orgId: n.orgId, userId: n.userId, title: n.title, body: n.body, href: n.href, readAt: n.readAt, createdAt: n.createdAt,
  category: NotificationCategorySchema.catch("OTHER").parse(n.category),
});

const toJoin = (j: typeof joinRequests.$inferSelect) => ({ id: j.id, orgId: j.orgId, userId: j.userId, status: j.status as JoinRequestStatus, createdAt: j.createdAt });

export class DrizzleIdentityUow implements IdentityUow {
  constructor(private db: Db, private grant?: CreditGrantTx) {}
  system<T>(fn: (r: IdentityRepos) => Promise<T>) {
    return withSystem(this.db, (tx) => fn(repos(tx, this.grant)));
  }
  asUser<T>(userId: UserId, fn: (r: IdentityRepos) => Promise<T>) {
    return withUser(this.db, userId, (tx) => fn(repos(tx, this.grant)));
  }
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: IdentityRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx, this.grant)));
  }
}
