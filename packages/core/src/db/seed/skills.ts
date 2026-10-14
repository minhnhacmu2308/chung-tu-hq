import type { Db } from "../client.js";
import { organizations, skillVersions, skills } from "../schema/index.js";
import { systemClock } from "../../shared/clock.js";
import { ulidIdGen } from "../../shared/ids.js";
import { cloneTemplatesForOrg } from "../../modules/skill/index.js";
import { DrizzleSkillUow } from "../../modules/skill/infrastructure/index.js";
import type { SkillDeps } from "../../modules/skill/index.js";
import { skillTemplates } from "./skill-templates.js";

/** Org hệ thống: giữ skill mẫu (is_template). Không ai đăng nhập vào org này. */
export const SYSTEM_ORG_ID = "org_system";

/** Chạy bằng admin (bỏ RLS). Idempotent theo (org, code) và (skill, version). */
export async function seedSkillTemplates(db: Db) {
  await db
    .insert(organizations)
    .values({ id: SYSTEM_ORG_ID, taxCode: "0000000000", name: "KhaiBáo AI – skill mẫu hệ thống", address: "", phone: "", planCode: "ENTERPRISE" })
    .onConflictDoNothing();
  for (const s of skillTemplates().skills) {
    const id = `sk_tpl_${s.code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    await db
      .insert(skills)
      .values({
        id, orgId: SYSTEM_ORG_ID, code: s.code, name: s.name, kind: s.kind, docKind: s.docKind ?? null, supplier: s.supplier ?? null, language: s.language,
        enabled: s.enabled, isTemplate: true, templateId: null, currentVersion: 1, labeledSamples: 0, accuracy: null,
      })
      .onConflictDoNothing();
    await db.insert(skillVersions).values({ id: `${id}_v1`, orgId: SYSTEM_ORG_ID, skillId: id, version: 1, fields: s.fields, promptNotes: null, createdBy: null }).onConflictDoNothing();
  }
}

/** Sao chép skill mẫu cho một org (seed demo). Dùng use case thật qua uow trên kết nối admin. */
export async function seedOrgSkills(db: Db, orgId: string, userId: string) {
  // cloneTemplatesForOrg chỉ dùng uow/clock/idGen; không cần storage/AI khi seed.
  const deps = { uow: new DrizzleSkillUow(db), clock: systemClock, idGen: ulidIdGen } as unknown as SkillDeps;
  const r = await cloneTemplatesForOrg(deps, { orgId, userId });
  if (!r.ok) throw new Error(`seed skill cho ${orgId}: ${r.error.code}`);
  return r.value;
}
