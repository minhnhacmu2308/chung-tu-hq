import { createHash } from "node:crypto";
import { sampleMime } from "../domain/mime.js";
import { customFieldsOf, extractionSchemaFor, MIN_SAMPLES_FOR_ACCURACY, withCustomFields, type EvaluationResult } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { scoreSample, summarize } from "../domain/accuracy.js";
import { fieldHints, projectResult } from "../domain/schema-keys.js";
import { loadSkill, toEvaluation } from "./_dto.js";
import type { SkillDeps } from "./ports.js";

/** Yêu cầu đánh giá lại: kiểm tra điều kiện rồi đẩy job `skill-evaluate` (AI chạy nền). */
export async function evaluateSkill(deps: SkillDeps, ctx: Ctx, skillId: string): Promise<Result<{ queued: true; version: number }>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const check = await deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    const labeled = (await r.samples.list(ctx.orgId, skillId)).filter((s) => s.status === "LABELED");
    if (labeled.length < MIN_SAMPLES_FOR_ACCURACY) return err(domainError("NOT_ENOUGH_SAMPLES", `Cần ít nhất ${MIN_SAMPLES_FOR_ACCURACY} mẫu đã gắn nhãn để đánh giá (hiện có ${labeled.length})`));
    const setHash = createHash("sha256").update(labeled.map((s) => `${s.id}:${s.labeledAt?.toISOString() ?? ""}`).sort().join("|")).digest("hex").slice(0, 16);
    return ok({ version: l.value.skill.currentVersion, setHash });
  });
  if (!check.ok) return check;
  await deps.queue.enqueue("skill-evaluate", { orgId: ctx.orgId, userId: ctx.userId, skillId, version: check.value.version }, { jobId: `skill-eval:${skillId}:${check.value.version}:${check.value.setHash}` });
  return ok({ queued: true, version: check.value.version });
}

/** Job: đọc lại từng mẫu LABELED bằng phiên bản hiện tại, so với expected → skill_evaluations + accuracy của skill. */
export async function runEvaluation(deps: SkillDeps, input: { orgId: string; userId: string; skillId: string; version: number }): Promise<Result<EvaluationResult>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const prep = await deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, input.orgId, input.skillId);
    if (!l.ok) return l;
    const version = l.value.skill.currentVersion === input.version ? l.value.version : await r.versions.get(input.skillId, input.version);
    if (!version) return err(domainError("NOT_FOUND", "Không có phiên bản skill"));
    if (!l.value.skill.docKind) return err(domainError("NOT_SUPPORTED", "Skill không gắn loại chứng từ"));
    const labeled = (await r.samples.list(input.orgId, input.skillId)).filter((s) => s.status === "LABELED" && s.expected !== null);
    return ok({ skill: l.value.skill, version, labeled, docKind: l.value.skill.docKind });
  });
  if (!prep.ok) return prep;
  const { skill, version, labeled, docKind } = prep.value;
  if (labeled.length < MIN_SAMPLES_FOR_ACCURACY) return err(domainError("NOT_ENOUGH_SAMPLES", `Cần ít nhất ${MIN_SAMPLES_FOR_ACCURACY} mẫu đã gắn nhãn`));

  const scores: Record<string, boolean>[] = [];
  for (const s of labeled) {
    const bytes = await deps.storage.get(s.storageKey);
    const mime = sampleMime(s.fileName, bytes);
    const pages = Array.from({ length: Math.max(1, s.pages) }, (_, i) => i + 1);
    const res = await deps.ai.extract({ bytes, mime, pages: s.pages, fileName: s.fileName }, pages, withCustomFields(extractionSchemaFor(docKind), customFieldsOf(docKind, version.fields)), { kind: docKind, skillHints: fieldHints(docKind, version.fields), examples: [], supplierHint: skill.supplier });
    // Khóa theo (skill, phiên bản, mẫu): job đánh giá chạy lại giữa chừng không tính tiền lại các mẫu đã đọc.
    await deps.usage.record({ orgId: input.orgId, dossierId: null, documentId: null, kind: "AI_EXTRACT", provider: deps.ai.name, model: res.usage.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, dedupeKey: `ai:eval:${input.skillId}:${version.version}:${s.id}` });
    scores.push(scoreSample(version.fields, s.expected!, projectResult(docKind, version.fields, res.result)));
  }
  const sum = summarize(version.fields, scores);
  const now = deps.clock.now();
  const row = {
    id: deps.idGen.next("sk"), orgId: input.orgId, skillId: input.skillId, version: version.version, accuracy: sum.accuracy.toFixed(4),
    previousAccuracy: skill.accuracy, perField: sum.fields, samples: labeled.length, finishedAt: now,
  };
  await deps.uow.asOrg(ctx, async (r) => {
    await r.evaluations.insert(row);
    await r.skills.update(input.orgId, input.skillId, { accuracy: row.accuracy, updatedAt: now });
  });
  return ok(toEvaluation(row));
}

export async function getEvaluation(deps: SkillDeps, ctx: Ctx, skillId: string): Promise<Result<EvaluationResult | null>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    const e = await r.evaluations.latest(ctx.orgId, skillId);
    return ok(e ? toEvaluation(e) : null);
  });
}
