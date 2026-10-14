import type { EvaluationResult, LabeledSample, Skill } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { EvaluationRow, SampleRow, SkillRepos, SkillRow, SkillVersionRow } from "./ports.js";

export function toSkill(s: SkillRow, v: SkillVersionRow): Skill {
  return {
    id: s.id, code: s.code, name: s.name, kind: s.kind, language: s.language, version: s.currentVersion, labeledSamples: s.labeledSamples,
    updatedAt: s.updatedAt.toISOString(), enabled: s.enabled, fields: v.fields,
    ...(s.docKind ? { docKind: s.docKind } : {}),
    ...(s.supplier ? { supplier: s.supplier } : {}),
    ...(s.accuracy !== null ? { accuracy: Number(s.accuracy) } : {}),
  };
}

export function toSample(s: SampleRow, names: Map<string, string>): LabeledSample {
  return {
    id: s.id, fileName: s.fileName, pages: s.pages, sizeBytes: s.sizeBytes, status: s.status,
    labeledBy: s.labeledBy ? (names.get(s.labeledBy) ?? "") : "",
    labeledAt: (s.labeledAt ?? s.createdAt).toISOString(),
  };
}

export function toEvaluation(e: EvaluationRow): EvaluationResult {
  return {
    skillId: e.skillId, version: e.version, accuracy: Number(e.accuracy), samples: e.samples, fields: e.perField, finishedAt: e.finishedAt.toISOString(),
    ...(e.previousAccuracy !== null ? { previousAccuracy: Number(e.previousAccuracy) } : {}),
  };
}

/** Skill + phiên bản hiện tại của org; không có (kể cả skill mẫu của org khác) → NOT_FOUND. */
export async function loadSkill(r: SkillRepos, orgId: string, id: string): Promise<Result<{ skill: SkillRow; version: SkillVersionRow }>> {
  const skill = await r.skills.get(orgId, id);
  if (!skill || skill.orgId !== orgId) return err(domainError("NOT_FOUND", "Không tìm thấy skill"));
  const version = await r.versions.get(skill.id, skill.currentVersion);
  if (!version) return err(domainError("NOT_FOUND", "Skill chưa có phiên bản"));
  return ok({ skill, version });
}
