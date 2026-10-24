import { readSample, runEvaluation, type SkillDeps } from "@kb/core/modules/skill";
import { createLogger } from "@kb/core/shared";
import { z } from "zod";
import { parsePayload } from "./_payload.js";

const log = createLogger({ name: "worker" });

export const SkillSampleReadPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), sampleId: z.string().min(1) });
export const SkillEvaluatePayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), skillId: z.string().min(1), version: z.number().int().positive() });

/** AI đọc mẫu vừa tải lên → nhãn nháp. Lỗi tạm (AI 429/5xx) ném ra để BullMQ retry. */
export async function skillSampleReadJob(deps: SkillDeps, raw: unknown) {
  const p = parsePayload(SkillSampleReadPayload, raw, "skill-sample-read");
  const r = await readSample(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "skill-sample-read", sampleId: p.sampleId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? "ok" : r.error.code;
}

/** Đánh giá lại skill trên mẫu đã gắn nhãn. */
export async function skillEvaluateJob(deps: SkillDeps, raw: unknown) {
  const p = parsePayload(SkillEvaluatePayload, raw, "skill-evaluate");
  const r = await runEvaluation(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "skill-evaluate", skillId: p.skillId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? `ok accuracy=${r.value.accuracy}` : r.error.code;
}
