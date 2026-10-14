// Cấu hình Skill AI – gọi backend thật. Cùng chữ ký với src/mocks/api/skills.ts.
import { EvaluationResultSchema, LabeledSampleSchema, SkillSchema, type EvaluationResult, type SkillField, type SkillFieldPatch, type SkillKind } from "@kb/contracts";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/http";

export const listSkills = (kind?: SkillKind) => apiGet(`skills${kind ? `?kind=${kind}` : ""}`, z.array(SkillSchema));
export const getSkillById = (id: string) => apiGet(`skills/${id}`, SkillSchema);
export const setSkillEnabled = (id: string, enabled: boolean) => apiPatch(`skills/${id}/enabled`, { enabled }, SkillSchema);
export const updateSkillField = (skillId: string, key: string, patch: SkillFieldPatch) => apiPatch(`skills/${skillId}/fields/${encodeURIComponent(key)}`, patch, SkillSchema);
export const addSkillField = (skillId: string, field: SkillField) => apiPost(`skills/${skillId}/fields`, field, SkillSchema);
export const removeSkillField = (skillId: string, key: string) => apiDelete(`skills/${skillId}/fields/${encodeURIComponent(key)}`, SkillSchema);

export const listSamples = (skillId: string) => apiGet(`skills/${skillId}/samples`, z.array(LabeledSampleSchema));
export const uploadSamples = (skillId: string, files: File[]) => {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  return apiUpload(`skills/${skillId}/samples`, form, z.array(LabeledSampleSchema));
};
export const confirmPendingSamples = async (skillId: string) => (await apiPost(`skills/${skillId}/samples/confirm`, {}, z.object({ confirmed: z.number().int() }))).confirmed;

export const getEvaluation = async (skillId: string) => (await apiGet(`skills/${skillId}/evaluation`, z.object({ evaluation: EvaluationResultSchema.nullable() }))).evaluation;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Đẩy job đánh giá rồi chờ kết quả mới (poll ≤ 3 phút). */
export async function evaluateSkill(skillId: string): Promise<EvaluationResult> {
  const before = await getEvaluation(skillId);
  await apiPost(`skills/${skillId}/evaluate`, {}, z.object({ queued: z.literal(true), version: z.number().int() }));
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(1500);
    const now = await getEvaluation(skillId);
    if (now && now.finishedAt !== before?.finishedAt) return now;
  }
  throw new ApiError("TIMEOUT", "Đánh giá đang chạy nền lâu hơn dự kiến. Mở lại trang sau ít phút để xem kết quả.", 504);
}
