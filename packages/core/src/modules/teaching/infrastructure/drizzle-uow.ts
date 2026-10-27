import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { teachLessons, teachSamples, teachSettings } from "../../../db/schema/teaching.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { StoredLesson, TeachRepos, TeachSampleRow, TeachUow } from "../application/ports.js";

function repos(tx: Tx): TeachRepos {
  const toSample = (s: typeof teachSamples.$inferSelect): TeachSampleRow => ({
    ...s, status: s.status as TeachSampleRow["status"], read: s.read as TeachSampleRow["read"], comparison: s.comparison as TeachSampleRow["comparison"],
  });
  const toLesson = (l: typeof teachLessons.$inferSelect): StoredLesson => ({
    ...l, kind: l.kind as StoredLesson["kind"], status: l.status as StoredLesson["status"], context: l.context as StoredLesson["context"], line: l.line as StoredLesson["line"],
    conflicts: l.conflicts as StoredLesson["conflicts"], sampleIds: l.sampleIds as string[],
  });
  return {
    settings: {
      enabled: async (orgId) => (await tx.select().from(teachSettings).where(eq(teachSettings.orgId, orgId)).limit(1))[0]?.enabled ?? false,
      set: async (orgId, enabled, now) =>
        void (await tx.insert(teachSettings).values({ orgId, enabled, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: teachSettings.orgId, set: { enabled, updatedAt: now } })),
    },
    samples: {
      list: async (orgId, limit) => (await tx.select().from(teachSamples).where(eq(teachSamples.orgId, orgId)).orderBy(desc(teachSamples.createdAt), teachSamples.id).limit(limit)).map(toSample),
      get: async (orgId, id) => {
        const s = (await tx.select().from(teachSamples).where(and(eq(teachSamples.orgId, orgId), eq(teachSamples.id, id))).limit(1))[0];
        return s ? toSample(s) : null;
      },
      insert: async (row) => void (await tx.insert(teachSamples).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(teachSamples).set(patch).where(and(eq(teachSamples.orgId, orgId), eq(teachSamples.id, id)))),
      delete: async (orgId, id) => void (await tx.delete(teachSamples).where(and(eq(teachSamples.orgId, orgId), eq(teachSamples.id, id)))),
    },
    lessons: {
      list: async (orgId) => (await tx.select().from(teachLessons).where(eq(teachLessons.orgId, orgId)).orderBy(desc(teachLessons.updatedAt), teachLessons.id)).map(toLesson),
      get: async (orgId, id) => {
        const l = (await tx.select().from(teachLessons).where(and(eq(teachLessons.orgId, orgId), eq(teachLessons.id, id))).limit(1))[0];
        return l ? toLesson(l) : null;
      },
      byIdentities: async (orgId, identities) =>
        identities.length ? (await tx.select().from(teachLessons).where(and(eq(teachLessons.orgId, orgId), inArray(teachLessons.identity, identities)))).map(toLesson) : [],
      upsert: async (row) => {
        const { id: _id, orgId: _org, identity: _identity, createdAt: _c, ...rest } = row;
        await tx.insert(teachLessons).values(row).onConflictDoUpdate({ target: [teachLessons.orgId, teachLessons.identity], set: rest });
      },
      update: async (orgId, id, patch) => void (await tx.update(teachLessons).set(patch).where(and(eq(teachLessons.orgId, orgId), eq(teachLessons.id, id)))),
    },
  };
}

export class DrizzleTeachUow implements TeachUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: TeachRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
