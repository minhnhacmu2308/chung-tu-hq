import { customFieldsOf } from "@kb/contracts";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { SkillResolver } from "../../extraction/index.js";
import { resolveCandidates } from "../domain/field-rules.js";
import { fieldHints } from "../domain/schema-keys.js";
import type { SkillDeps } from "./ports.js";

/** Cổng cho extraction: skill (enabled) hợp nhất cho loại chứng từ + nhà cung cấp → gợi ý trường + id phiên bản (idempotency key). */
export function createSkillResolver(deps: SkillDeps): SkillResolver {
  return {
    resolve: (orgId, kind, supplierHint) =>
      deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, async (r) => {
        const chosen = resolveCandidates(await r.skills.list(orgId), kind, supplierHint);
        if (!chosen?.docKind) return { skillVersionId: null, fieldHints: [], examples: [], customFields: [] };
        const v = await r.versions.get(chosen.id, chosen.currentVersion);
        if (!v) return { skillVersionId: null, fieldHints: [], examples: [], customFields: [] };
        const examples = (await r.samples.list(orgId, chosen.id)).filter((s) => s.status === "LABELED" && s.expected).slice(0, 2).map((s) => s.expected);
        return { skillVersionId: v.id, fieldHints: fieldHints(chosen.docKind, v.fields), examples, customFields: customFieldsOf(chosen.docKind, v.fields) };
      }),
  };
}
