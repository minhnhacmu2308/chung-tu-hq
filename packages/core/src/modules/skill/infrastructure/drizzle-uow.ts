import { and, desc, eq } from "drizzle-orm";
import type { Db, Tx } from "../../../db/client.js";
import { skillEvaluations, skillSamples, skillVersions, skills } from "../../../db/schema/skill.js";
import { withCtx } from "../../../db/with-ctx.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import type { EvaluationRow, SampleRow, SkillRepos, SkillRow, SkillUow, SkillVersionRow } from "../application/ports.js";

function repos(tx: Tx): SkillRepos {
  const toSkill = (s: typeof skills.$inferSelect): SkillRow => ({ ...s, kind: s.kind as SkillRow["kind"], docKind: s.docKind as SkillRow["docKind"] });
  const toVersion = (v: typeof skillVersions.$inferSelect): SkillVersionRow => ({ ...v, fields: v.fields as SkillVersionRow["fields"] });
  const toSample = (s: typeof skillSamples.$inferSelect): SampleRow => ({ ...s, status: s.status as SampleRow["status"], expected: s.expected as SampleRow["expected"] });
  const toEval = (e: typeof skillEvaluations.$inferSelect): EvaluationRow => ({ ...e, perField: e.perField as EvaluationRow["perField"] });
  return {
    skills: {
      list: async (orgId, kind) => (await tx.select().from(skills).where(and(eq(skills.orgId, orgId), ...(kind ? [eq(skills.kind, kind)] : []))).orderBy(skills.code)).map(toSkill),
      get: async (orgId, id) => {
        const s = (await tx.select().from(skills).where(and(eq(skills.orgId, orgId), eq(skills.id, id))).limit(1))[0];
        return s ? toSkill(s) : null;
      },
      listTemplates: async () => (await tx.select().from(skills).where(and(eq(skills.isTemplate, true), eq(skills.published, true))).orderBy(skills.code)).map(toSkill),
      insert: async (row) => void (await tx.insert(skills).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(skills).set(patch).where(and(eq(skills.orgId, orgId), eq(skills.id, id)))),
    },
    versions: {
      get: async (skillId, version) => {
        const v = (await tx.select().from(skillVersions).where(and(eq(skillVersions.skillId, skillId), eq(skillVersions.version, version))).limit(1))[0];
        return v ? toVersion(v) : null;
      },
      insert: async (row) => void (await tx.insert(skillVersions).values(row)),
    },
    samples: {
      list: async (orgId, skillId) => (await tx.select().from(skillSamples).where(and(eq(skillSamples.orgId, orgId), eq(skillSamples.skillId, skillId))).orderBy(desc(skillSamples.createdAt), skillSamples.id)).map(toSample),
      get: async (orgId, id) => {
        const s = (await tx.select().from(skillSamples).where(and(eq(skillSamples.orgId, orgId), eq(skillSamples.id, id))).limit(1))[0];
        return s ? toSample(s) : null;
      },
      insert: async (row) => void (await tx.insert(skillSamples).values(row)),
      update: async (orgId, id, patch) => void (await tx.update(skillSamples).set(patch).where(and(eq(skillSamples.orgId, orgId), eq(skillSamples.id, id)))),
    },
    evaluations: {
      latest: async (orgId, skillId) => {
        const e = (await tx.select().from(skillEvaluations).where(and(eq(skillEvaluations.orgId, orgId), eq(skillEvaluations.skillId, skillId))).orderBy(desc(skillEvaluations.finishedAt)).limit(1))[0];
        return e ? toEval(e) : null;
      },
      insert: async (row) => void (await tx.insert(skillEvaluations).values(row)),
    },
  };
}

export class DrizzleSkillUow implements SkillUow {
  constructor(private db: Db) {}
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: SkillRepos) => Promise<T>) {
    return withCtx(this.db, ctx, (tx) => fn(repos(tx)));
  }
}
