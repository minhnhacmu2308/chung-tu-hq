// Truy vấn của khu Quản trị hệ thống trên kết nối kb_platform (BYPASSRLS – ADR 0006).
// Quy tắc: chỉ đọc cột tài khoản/trạng thái/đếm/tổng tiền; KHÔNG đọc nội dung hồ sơ, chứng từ, tờ khai, khóa của doanh nghiệp.
import type { IntegrationId, Role, StaffRole } from "@kb/contracts";
import { and, desc, eq, gt, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import {
  adminAudit, announcements, digitalCertificates, documents, dossiers, integrationStatus, joinRequests, memberships, notifications, organizations,
  plans, platformIntegrations, platformStaff, sessions, skills, usageEvents, users,
} from "../../../db/schema/index.js";
import type { StaffStatus } from "../domain/staff-rules.js";

/** Doanh nghiệp hệ thống giữ skill mẫu (db/seed/skills.ts) – không hiện ở khu quản trị. */
const SYSTEM_ORG_ID = "org_system";
import type { AdminOrgRow, AdminRepos, AdminUow, AnnouncementRow, AuditRow, OrgUsage, PlatformIntegrationRow, StaffRow } from "../application/ports.js";

/** Phân loại giá vốn theo `usage_events.kind`: AI_* = đọc chứng từ, HS_* = gợi ý HS, CUSTOMS_* = Customs Hub. */
const costByKind = (prefix: string) => sql<string>`coalesce(sum(case when ${usageEvents.kind} like ${`${prefix}%`} then ${usageEvents.costVnd} else 0 end), 0)::text`;

function repos(tx: Tx): AdminRepos {
  const staffSelect = () =>
    tx
      .select({
        userId: platformStaff.userId, name: users.name, email: users.email, role: platformStaff.role, status: platformStaff.status, createdAt: platformStaff.createdAt,
        mfaEnabled: sql<boolean>`(${platformStaff.totpEnabledAt} is not null and ${platformStaff.totpCiphertext} is not null)`,
        lastActiveAt: sql<Date | null>`(select max(${sessions.lastSeenAt}) from ${sessions} where ${sessions.userId} = ${platformStaff.userId})`.mapWith((v) => (v ? new Date(v as string) : null)),
      })
      .from(platformStaff)
      .innerJoin(users, eq(users.id, platformStaff.userId));
  const toStaff = (r: { userId: string; name: string; email: string; role: string; status: string; createdAt: Date; lastActiveAt: Date | null; mfaEnabled: boolean }): StaffRow => ({
    ...r, role: r.role as StaffRole, status: r.status as StaffStatus,
  });
  const toOrg = (o: typeof organizations.$inferSelect): AdminOrgRow => ({
    id: o.id, name: o.name, taxCode: o.taxCode, address: o.address, phone: o.phone, planCode: o.planCode, status: o.status as AdminOrgRow["status"],
    suspendedReason: o.suspendedReason, quotaBonus: o.quotaBonus, quotaBonusMonth: o.quotaBonusMonth, planStartedAt: o.planStartedAt, trialEndsAt: o.trialEndsAt, createdAt: o.createdAt,
  });
  const lastSeen = sql<Date | null>`(select max(${sessions.lastSeenAt}) from ${sessions} where ${sessions.userId} = ${memberships.userId} and ${sessions.orgId} = ${memberships.orgId})`.mapWith((v) =>
    v ? new Date(v as string) : null,
  );

  return {
    staff: {
      get: async (userId) => {
        const r = (await staffSelect().where(eq(platformStaff.userId, userId)).limit(1))[0];
        return r ? toStaff(r) : null;
      },
      list: async () => (await staffSelect().orderBy(platformStaff.createdAt)).map(toStaff),
      insert: async (row) => void (await tx.insert(platformStaff).values({ userId: row.userId, role: row.role, status: row.status, invitedBy: row.invitedBy, createdAt: row.at, updatedAt: row.at })),
      update: async (userId, patch, at) => void (await tx.update(platformStaff).set({ ...patch, updatedAt: at }).where(eq(platformStaff.userId, userId))),
      getMfa: async (userId) =>
        (
          await tx
            .select({
              totpCiphertext: platformStaff.totpCiphertext, totpPendingCiphertext: platformStaff.totpPendingCiphertext, totpKeyVersion: platformStaff.totpKeyVersion,
              totpEnabledAt: platformStaff.totpEnabledAt, totpLastCounter: platformStaff.totpLastCounter, recoveryCodes: platformStaff.recoveryCodes,
            })
            .from(platformStaff)
            .where(eq(platformStaff.userId, userId))
            .limit(1)
        )[0] ?? null,
      setMfa: async (userId, patch, at) => void (await tx.update(platformStaff).set({ ...patch, updatedAt: at }).where(eq(platformStaff.userId, userId))),
    },
    sessions: {
      findValid: async (tokenHash, now) =>
        (await tx.select({ id: sessions.id, userId: sessions.userId, mfaVerifiedAt: sessions.mfaVerifiedAt }).from(sessions).where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now))).limit(1))[0] ?? null,
      markMfaVerified: async (sessionId, at) => void (await tx.update(sessions).set({ mfaVerifiedAt: at }).where(eq(sessions.id, sessionId))),
      listByUsers: async (userIds, now) =>
        userIds.length === 0
          ? []
          : tx
              .select({ id: sessions.id, userId: sessions.userId, orgId: sessions.orgId, ip: sessions.ip, userAgent: sessions.userAgent, lastSeenAt: sessions.lastSeenAt })
              .from(sessions)
              .where(and(inArray(sessions.userId, userIds), gt(sessions.expiresAt, now)))
              .orderBy(desc(sessions.lastSeenAt)),
      deleteByUser: async (userId, orgId) =>
        (await tx.delete(sessions).where(orgId ? and(eq(sessions.userId, userId), eq(sessions.orgId, orgId)) : eq(sessions.userId, userId)).returning({ id: sessions.id })).length,
    },
    orgs: {
      // Bỏ doanh nghiệp hệ thống (chỉ giữ skill mẫu) – không phải khách hàng.
      list: async () => (await tx.select().from(organizations).where(ne(organizations.id, SYSTEM_ORG_ID)).orderBy(desc(organizations.createdAt))).map(toOrg),
      get: async (id) => {
        const o = (await tx.select().from(organizations).where(eq(organizations.id, id)).limit(1))[0];
        return o ? toOrg(o) : null;
      },
      update: async (id, patch, at) => void (await tx.update(organizations).set({ ...patch, updatedAt: at }).where(eq(organizations.id, id))),
    },
    members: {
      list: async (orgId) =>
        (
          await tx
            .select({
              userId: memberships.userId, orgId: memberships.orgId, name: users.name, email: users.email, role: memberships.role, status: memberships.status,
              emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt, lastSeenAt: lastSeen,
            })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(orgId ? eq(memberships.orgId, orgId) : undefined)
        ).map(({ emailVerifiedAt, ...m }) => ({ ...m, role: m.role as Role, status: m.status as "ACTIVE" | "INVITED" | "DISABLED", emailVerified: emailVerifiedAt !== null })),
      setStatus: async (orgId, userId, status) => void (await tx.update(memberships).set({ status, updatedAt: new Date() }).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))),
      activeRecipients: async (orgIds) =>
        orgIds.length === 0
          ? []
          : tx.select({ orgId: memberships.orgId, userId: memberships.userId }).from(memberships).where(and(inArray(memberships.orgId, orgIds), eq(memberships.status, "ACTIVE"))),
    },
    joins: {
      listPending: async (orgId) =>
        (
          await tx
            .select({ userId: joinRequests.userId, orgId: joinRequests.orgId, name: users.name, email: users.email, emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt, requestedAt: joinRequests.createdAt })
            .from(joinRequests)
            .innerJoin(users, eq(users.id, joinRequests.userId))
            .where(and(eq(joinRequests.status, "PENDING"), orgId ? eq(joinRequests.orgId, orgId) : undefined))
        ).map(({ emailVerifiedAt, ...j }) => ({ ...j, emailVerified: emailVerifiedAt !== null })),
    },
    plans: {
      list: async () => tx.select({ code: plans.code, name: plans.name, dossiersPerMonth: plans.dossiersPerMonth, pagesPerDossier: plans.pagesPerDossier, priceVnd: plans.priceVnd }).from(plans).orderBy(plans.dossiersPerMonth),
      get: async (code) => (await tx.select({ code: plans.code, name: plans.name, dossiersPerMonth: plans.dossiersPerMonth, pagesPerDossier: plans.pagesPerDossier, priceVnd: plans.priceVnd }).from(plans).where(eq(plans.code, code)).limit(1))[0] ?? null,
      update: async (code, patch, at) => void (await tx.update(plans).set({ ...patch, updatedAt: at }).where(eq(plans.code, code))),
    },
    usage: {
      byOrg: async (from, to) => {
        const [dossierRows, pageRows, costRows] = await Promise.all([
          tx.select({ orgId: dossiers.orgId, n: sql<number>`count(*)::int` }).from(dossiers).where(and(gte(dossiers.createdAt, from), lt(dossiers.createdAt, to))).groupBy(dossiers.orgId),
          tx.select({ orgId: documents.orgId, n: sql<number>`coalesce(sum(${documents.pages}), 0)::int` }).from(documents).where(and(gte(documents.createdAt, from), lt(documents.createdAt, to))).groupBy(documents.orgId),
          tx
            .select({ orgId: usageEvents.orgId, calls: sql<number>`count(*)::int`, read: costByKind("AI_"), hs: costByKind("HS_"), customs: costByKind("CUSTOMS_") })
            .from(usageEvents)
            .where(and(gte(usageEvents.at, from), lt(usageEvents.at, to)))
            .groupBy(usageEvents.orgId),
        ]);
        const out = new Map<string, OrgUsage>();
        const row = (orgId: string) => out.get(orgId) ?? out.set(orgId, { orgId, dossiers: 0, pages: 0, aiCalls: 0, readCostVnd: "0", hsCostVnd: "0", customsCostVnd: "0" }).get(orgId)!;
        for (const r of dossierRows) row(r.orgId).dossiers = r.n;
        for (const r of pageRows) row(r.orgId).pages = r.n;
        for (const r of costRows) Object.assign(row(r.orgId), { aiCalls: r.calls, readCostVnd: r.read, hsCostVnd: r.hs, customsCostVnd: r.customs });
        return [...out.values()];
      },
    },
    orgConnections: {
      integrations: async (orgId) => (await tx.select({ id: integrationStatus.kind, status: integrationStatus.status }).from(integrationStatus).where(eq(integrationStatus.orgId, orgId))).map((r) => ({ id: r.id as IntegrationId, status: r.status })),
      certificates: async (orgId) =>
        tx.select({ id: digitalCertificates.id, issuer: digitalCertificates.issuer, validTo: digitalCertificates.validTo, isDefault: digitalCertificates.isDefault }).from(digitalCertificates).where(eq(digitalCertificates.orgId, orgId)),
    },
    platformIntegrations: {
      list: async () => (await tx.select().from(platformIntegrations)).map((r): PlatformIntegrationRow => ({ ...r, id: r.id as IntegrationId, environment: r.environment as PlatformIntegrationRow["environment"], status: r.status as PlatformIntegrationRow["status"] })),
      upsert: async (row, at) => {
        const values = { ...row, updatedAt: at };
        await tx.insert(platformIntegrations).values(values).onConflictDoUpdate({ target: platformIntegrations.id, set: values });
      },
    },
    templates: {
      list: async () => {
        const rows = await tx
          .select({
            id: skills.id, code: skills.code, name: skills.name, kind: skills.kind, docKind: skills.docKind, version: skills.currentVersion, published: skills.published, updatedAt: skills.updatedAt,
            // Drizzle bỏ tên bảng khi select một bảng → subquery phải ghi tường minh "skills"."…" để không so nhầm cột của bảng trong subquery.
            fieldCount: sql<number>`coalesce((select jsonb_array_length(sv.fields) from skill_versions sv where sv.skill_id = "skills"."id" and sv.version = "skills"."current_version"), 0)::int`,
            orgCount: sql<number>`(select count(distinct s2.org_id) from skills s2 where s2.template_id = "skills"."id")::int`,
          })
          .from(skills)
          .where(eq(skills.isTemplate, true))
          .orderBy(skills.code);
        return rows;
      },
      setPublished: async (id, published, at) => void (await tx.update(skills).set({ published, updatedAt: at }).where(and(eq(skills.id, id), eq(skills.isTemplate, true)))),
    },
    audit: {
      insert: async (row) => void (await tx.insert(adminAudit).values(row)),
      list: async ({ orgId, limit }) => (await tx.select().from(adminAudit).where(orgId ? eq(adminAudit.orgId, orgId) : undefined).orderBy(desc(adminAudit.at), desc(adminAudit.id)).limit(limit)) as AuditRow[],
    },
    announcements: {
      list: async () => (await tx.select().from(announcements).orderBy(desc(announcements.sentAt))) as AnnouncementRow[],
      get: async (id) => ((await tx.select().from(announcements).where(eq(announcements.id, id)).limit(1))[0] as AnnouncementRow | undefined) ?? null,
      insert: async (row) => void (await tx.insert(announcements).values(row)),
      setStatus: async (id, status) => void (await tx.update(announcements).set({ status }).where(eq(announcements.id, id))),
    },
    notifications: {
      insertMany: async (rows) => {
        if (rows.length === 0) return;
        await tx.insert(notifications).values(rows.map((r) => ({ id: r.id, orgId: r.orgId, userId: r.userId, title: r.title, body: r.body, announcementId: r.announcementId, createdAt: r.at })));
      },
      deleteByAnnouncement: async (announcementId) =>
        (await tx.delete(notifications).where(and(isNotNull(notifications.announcementId), eq(notifications.announcementId, announcementId))).returning({ id: notifications.id })).length,
    },
  };
}

export class DrizzleAdminUow implements AdminUow {
  constructor(private db: Db) {}
  run<T>(fn: (r: AdminRepos) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(repos(tx)));
  }
}
