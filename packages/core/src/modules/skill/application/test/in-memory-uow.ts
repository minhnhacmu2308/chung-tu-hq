import type { OrgId, UserId } from "../../../../shared/ids.js";
import type { EvaluationRow, SampleRow, SkillRepos, SkillRow, SkillUow, SkillVersionRow, SuggestionRow } from "../ports.js";

/** Fake mô phỏng RLS thật: dòng của org mình + skill mẫu (is_template) đọc được; ghi chỉ org mình. */
export class InMemorySkillUow implements SkillUow {
  readonly data = { skills: [] as SkillRow[], versions: [] as SkillVersionRow[], samples: [] as SampleRow[], evaluations: [] as EvaluationRow[], suggestions: [] as SuggestionRow[] };

  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: SkillRepos) => Promise<T>): Promise<T> {
    const d = this.data;
    const org = ctx.orgId as string;
    const deny = (w: string): never => {
      throw new Error(`new row violates row-level security policy (${w})`);
    };
    const clone = <X>(x: X): X => structuredClone(x);
    const visibleSkill = (s: SkillRow) => s.orgId === org || s.isTemplate;
    const repos: SkillRepos = {
      skills: {
        list: async (orgId, kind) => clone(d.skills.filter((s) => visibleSkill(s) && s.orgId === orgId && (!kind || s.kind === kind)).sort((a, b) => a.code.localeCompare(b.code))),
        get: async (orgId, id) => clone(d.skills.find((s) => s.id === id && visibleSkill(s) && s.orgId === orgId) ?? null),
        listTemplates: async () => clone(d.skills.filter((s) => s.isTemplate)),
        insert: async (row) => {
          if (row.orgId !== org) deny("skills insert");
          if (d.skills.some((s) => s.orgId === row.orgId && s.code === row.code)) throw new Error("duplicate key value violates unique constraint skills_org_code_uq");
          d.skills.push(clone(row));
        },
        update: async (orgId, id, patch) => {
          if (orgId !== org) deny(`skills update orgId ${orgId} khác ngữ cảnh`);
          const s = d.skills.find((x) => x.id === id && x.orgId === org);
          if (s) Object.assign(s, patch);
        },
      },
      versions: {
        get: async (skillId, version) => {
          const s = d.skills.find((x) => x.id === skillId);
          if (!s || !visibleSkill(s)) return null;
          return clone(d.versions.find((v) => v.skillId === skillId && v.version === version) ?? null);
        },
        insert: async (row) => {
          if (row.orgId !== org) deny("skill_versions insert");
          if (d.versions.some((v) => v.skillId === row.skillId && v.version === row.version)) throw new Error("duplicate key value violates unique constraint skill_versions_skill_version_uq");
          d.versions.push(clone(row));
        },
      },
      samples: {
        list: async (orgId, skillId) => clone(d.samples.filter((s) => s.orgId === org && s.orgId === orgId && s.skillId === skillId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
        get: async (orgId, id) => clone(d.samples.find((s) => s.id === id && s.orgId === org && s.orgId === orgId) ?? null),
        insert: async (row) => void (row.orgId === org ? d.samples.push(clone(row)) : deny("skill_samples insert")),
        update: async (orgId, id, patch) => {
          if (orgId !== org) deny(`skill_samples update orgId ${orgId} khác ngữ cảnh`);
          const s = d.samples.find((x) => x.id === id && x.orgId === org);
          if (s) Object.assign(s, clone(patch));
        },
      },
      suggestions: {
        list: async (orgId, f) =>
          clone(d.suggestions.filter((s) => s.orgId === org && s.orgId === orgId && (!f.skillId || s.skillId === f.skillId) && (!f.status || s.status === f.status)).sort((a, b) => b.hits - a.hits || b.updatedAt.getTime() - a.updatedAt.getTime())),
        get: async (orgId, id) => clone(d.suggestions.find((s) => s.id === id && s.orgId === org && s.orgId === orgId) ?? null),
        find: async (orgId, skillId, fieldKey, alias) => clone(d.suggestions.find((s) => s.orgId === org && s.orgId === orgId && s.skillId === skillId && s.fieldKey === fieldKey && s.alias === alias) ?? null),
        insert: async (row) => {
          if (row.orgId !== org) deny("skill_suggestions insert");
          if (d.suggestions.some((s) => s.skillId === row.skillId && s.fieldKey === row.fieldKey && s.alias === row.alias)) throw new Error("duplicate key value violates unique constraint skill_suggestions_uq");
          d.suggestions.push(clone(row));
        },
        update: async (orgId, id, patch) => {
          if (orgId !== org) deny(`skill_suggestions update orgId ${orgId} khác ngữ cảnh`);
          const s = d.suggestions.find((x) => x.id === id && x.orgId === org);
          if (s) Object.assign(s, clone(patch));
        },
      },
      evaluations: {
        latest: async (orgId, skillId) => clone(d.evaluations.filter((e) => e.orgId === org && e.orgId === orgId && e.skillId === skillId).sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime())[0] ?? null),
        insert: async (row) => void (row.orgId === org ? d.evaluations.push(clone(row)) : deny("skill_evaluations insert")),
      },
    };
    return fn(repos);
  }
}
