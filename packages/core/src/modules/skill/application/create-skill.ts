import { catalogSkillFields, CreateSkillInputSchema, nextSkillCode, type CreateSkillInput, type Skill, type SkillField } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { toSkill } from "./_dto.js";
import type { SkillDeps, SkillRow, SkillVersionRow } from "./ports.js";

/**
 * Doanh nghiệp tự tạo skill (ngoài bộ skill mẫu được sao chép khi tạo org).
 * Trường ban đầu: sao chép từ skill nguồn (của org hoặc skill mẫu đã phát hành) hoặc trường chuẩn của danh mục loại chứng từ.
 * Skill mới: version 1, chưa có mẫu/độ chính xác, đang bật.
 */
export async function createSkill(deps: SkillDeps, ctx: Ctx, input: CreateSkillInput): Promise<Result<Skill>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  const parsed = CreateSkillInputSchema.safeParse(input);
  if (!parsed.success) return err(domainError("VALIDATION", parsed.error.issues[0]?.message ?? "Dữ liệu skill không hợp lệ", parsed.error.issues));
  const cmd = parsed.data;

  const res = await deps.uow.asOrg(ctx, async (r): Promise<Result<Skill>> => {
    const existing = await r.skills.list(ctx.orgId);
    const codes = existing.map((s) => s.code);
    if (cmd.code && codes.includes(cmd.code)) return err(domainError("DUPLICATE", `Mã skill ${cmd.code} đã tồn tại`));
    const code = cmd.code ?? nextSkillCode(cmd.docKind, codes);

    let fields: SkillField[] = catalogSkillFields(cmd.docKind);
    let promptNotes: string | null = null;
    let templateId: string | null = null;
    if (cmd.copyFromSkillId) {
      // Nguồn: skill của chính org, hoặc skill mẫu đã phát hành (org hệ thống – chỉ đọc qua listTemplates).
      const own = existing.find((s) => s.id === cmd.copyFromSkillId);
      const source = own ?? (await r.skills.listTemplates()).find((t) => t.id === cmd.copyFromSkillId);
      const sv = source ? await r.versions.get(source.id, source.currentVersion) : null;
      if (!source || !sv) return err(domainError("NOT_FOUND", "Không tìm thấy skill nguồn để sao chép"));
      // Trường chuẩn gắn với danh mục của loại chứng từ → chỉ sao chép giữa skill cùng loại.
      if (source.docKind !== cmd.docKind) return err(domainError("VALIDATION", "Skill nguồn khác loại chứng từ"));
      fields = sv.fields;
      promptNotes = sv.promptNotes;
      templateId = own ? null : source.id;
    }

    const now = deps.clock.now();
    const row: SkillRow = {
      id: deps.idGen.next("sk"), orgId: ctx.orgId, code, name: cmd.name, kind: cmd.kind, docKind: cmd.docKind, supplier: cmd.supplier, language: cmd.language,
      enabled: true, isTemplate: false, templateId, currentVersion: 1, labeledSamples: 0, accuracy: null, createdAt: now, updatedAt: now,
    };
    const version: SkillVersionRow = { id: deps.idGen.next("sk"), orgId: ctx.orgId, skillId: row.id, version: 1, fields, promptNotes, createdBy: ctx.userId, createdAt: now };
    await r.skills.insert(row);
    await r.versions.insert(version);
    return ok(toSkill(row, version));
  });
  if (res.ok) await deps.audit?.record(ctx, { action: "SKILL_CREATED", targetType: "skill", targetId: res.value.id, targetLabel: res.value.name, detail: { code: res.value.code } });
  return res;
}
