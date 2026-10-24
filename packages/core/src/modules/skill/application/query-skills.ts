import type { Skill, SkillKind } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { loadSkill, toSkill } from "./_dto.js";
import type { SkillDeps } from "./ports.js";

export async function listSkills(deps: SkillDeps, ctx: Ctx, kind?: SkillKind): Promise<Result<Skill[]>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const rows = await r.skills.list(ctx.orgId, kind);
    const out: Skill[] = [];
    for (const s of rows) {
      const v = await r.versions.get(s.id, s.currentVersion);
      if (v) out.push(toSkill(s, v));
    }
    return ok(out);
  });
}

export async function getSkill(deps: SkillDeps, ctx: Ctx, id: string): Promise<Result<Skill>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, id);
    return l.ok ? ok(toSkill(l.value.skill, l.value.version)) : l;
  });
}

export async function setSkillEnabled(deps: SkillDeps, ctx: Ctx, id: string, enabled: boolean): Promise<Result<Skill>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, id);
    if (!l.ok) return l;
    const now = deps.clock.now();
    await r.skills.update(ctx.orgId, id, { enabled, updatedAt: now });
    return ok(toSkill({ ...l.value.skill, enabled, updatedAt: now }, l.value.version));
  });
  if (res.ok) await deps.audit?.record(ctx, { action: enabled ? "SKILL_ENABLED" : "SKILL_DISABLED", targetType: "skill", targetId: id, targetLabel: res.value.name });
  return res;
}
