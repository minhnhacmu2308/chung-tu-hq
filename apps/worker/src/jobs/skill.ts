import { readSample, runEvaluation, type SkillDeps } from "@kb/core/modules/skill";
import { z } from "zod";

export const SkillSampleReadPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), sampleId: z.string().min(1) });
export const SkillEvaluatePayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), skillId: z.string().min(1), version: z.number().int().positive() });

/** AI đọc mẫu vừa tải lên → nhãn nháp. Lỗi tạm (AI 429/5xx) ném ra để BullMQ retry. */
export async function skillSampleReadJob(deps: SkillDeps, raw: unknown) {
  const p = SkillSampleReadPayload.parse(raw);
  const r = await readSample(deps, p);
  if (!r.ok) console.warn(`[skill-sample-read] ${p.sampleId}: ${r.error.code} ${r.error.message ?? ""}`);
  return r.ok ? "ok" : r.error.code;
}

/** Đánh giá lại skill trên mẫu đã gắn nhãn. */
export async function skillEvaluateJob(deps: SkillDeps, raw: unknown) {
  const p = SkillEvaluatePayload.parse(raw);
  const r = await runEvaluation(deps, p);
  if (!r.ok) console.warn(`[skill-evaluate] ${p.skillId}: ${r.error.code} ${r.error.message ?? ""}`);
  return r.ok ? `ok accuracy=${r.value.accuracy}` : r.error.code;
}
