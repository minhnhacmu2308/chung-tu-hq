import type { Skill, SkillField, SkillFieldPatch } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { applyFieldPatch, canAddField, canRemoveField } from "../domain/field-rules.js";
import { loadSkill, toSkill } from "./_dto.js";
import type { SkillDeps, SkillRepos, SkillRow, SkillVersionRow } from "./ports.js";

/** Mỗi lần đổi cấu hình trường = một phiên bản mới (append-only), skill trỏ sang phiên bản đó. */
async function commitVersion(deps: SkillDeps, ctx: Ctx, r: SkillRepos, skill: SkillRow, fields: SkillField[]): Promise<Skill> {
  const now = deps.clock.now();
  const version = skill.currentVersion + 1;
  const row: SkillVersionRow = { id: deps.idGen.next("sk"), orgId: ctx.orgId, skillId: skill.id, version, fields, promptNotes: null, createdBy: ctx.userId, createdAt: now };
  await r.versions.insert(row);
  await r.skills.update(skill.id, { currentVersion: version, updatedAt: now });
  return toSkill({ ...skill, currentVersion: version, updatedAt: now }, row);
}

export async function updateSkillField(deps: SkillDeps, ctx: Ctx, skillId: string, key: string, patch: SkillFieldPatch): Promise<Result<Skill>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    const next = applyFieldPatch(l.value.version.fields, key, patch);
    if (!next.ok) return next;
    return ok(await commitVersion(deps, ctx, r, l.value.skill, next.value));
  });
}

export async function addSkillField(deps: SkillDeps, ctx: Ctx, skillId: string, field: SkillField): Promise<Result<Skill>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  const key = field.key.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) return err(domainError("VALIDATION", "Mã trường chỉ gồm chữ không dấu, số, dấu _ và bắt đầu bằng chữ"));
  if (!field.label.trim()) return err(domainError("VALIDATION", "Nhập tên hiển thị"));
  return deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    if (!l.value.skill.docKind) return err(domainError("NOT_SUPPORTED", "Skill không gắn loại chứng từ"));
    const can = canAddField(l.value.skill.docKind, l.value.version.fields, key);
    if (!can.ok) return can;
    return ok(await commitVersion(deps, ctx, r, l.value.skill, [...l.value.version.fields, { ...field, key, label: field.label.trim() }]));
  });
}

export async function removeSkillField(deps: SkillDeps, ctx: Ctx, skillId: string, key: string): Promise<Result<Skill>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    if (!l.value.skill.docKind) return err(domainError("NOT_SUPPORTED", "Skill không gắn loại chứng từ"));
    const can = canRemoveField(l.value.skill.docKind, l.value.version.fields, key);
    if (!can.ok) return can;
    return ok(await commitVersion(deps, ctx, r, l.value.skill, l.value.version.fields.filter((f) => f.key !== key)));
  });
}
