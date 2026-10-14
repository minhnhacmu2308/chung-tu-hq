import { asOrgId, asUserId } from "../../../shared/ids.js";
import { ok, type Result } from "../../../shared/result.js";
import type { SkillDeps } from "./ports.js";

/**
 * Sao chép skill mẫu (org hệ thống) cho một org: mỗi template → skill version 1 của org, chưa có mẫu/độ chính xác.
 * Idempotent theo code: org đã có skill cùng code thì bỏ qua. Gọi khi tạo org (identity) và khi seed.
 */
export async function cloneTemplatesForOrg(deps: SkillDeps, target: { orgId: string; userId: string }): Promise<Result<number>> {
  const now = deps.clock.now();
  return deps.uow.asOrg({ orgId: asOrgId(target.orgId), userId: asUserId(target.userId) }, async (r) => {
    const templates = await r.skills.listTemplates();
    const existing = new Set((await r.skills.list(target.orgId)).map((s) => s.code));
    let n = 0;
    for (const t of templates) {
      if (existing.has(t.code)) continue;
      const tv = await r.versions.get(t.id, t.currentVersion);
      if (!tv) continue;
      const id = deps.idGen.next("sk");
      await r.skills.insert({
        id, orgId: target.orgId, code: t.code, name: t.name, kind: t.kind, docKind: t.docKind, supplier: t.supplier, language: t.language, enabled: t.enabled,
        isTemplate: false, templateId: t.id, currentVersion: 1, labeledSamples: 0, accuracy: null, createdAt: now, updatedAt: now,
      });
      await r.versions.insert({ id: deps.idGen.next("sk"), orgId: target.orgId, skillId: id, version: 1, fields: tv.fields, promptNotes: tv.promptNotes, createdBy: null, createdAt: now });
      n++;
    }
    return ok(n);
  });
}
