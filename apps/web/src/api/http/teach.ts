// Dạy khai báo qua backend thật.
import { z } from "zod";
import { LessonSchema, TeachComparisonSchema, TeachOverviewSchema, TeachSampleSchema, TeachSettingsSchema, type UpdateLessonInput } from "@kb/contracts";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from "@/lib/http";

export const getTeachOverview = () => apiGet("teach", TeachOverviewSchema);
export const uploadTeachSamples = (files: File[]) => {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  return apiUpload("teach/samples", form, z.array(TeachSampleSchema));
};
export const getTeachComparison = (id: string) => apiGet(`teach/samples/${id}`, TeachComparisonSchema);
export const retryTeachSample = (id: string) => apiPost(`teach/samples/${id}/retry`, {}, TeachSampleSchema);
export const deleteTeachSample = async (id: string) => {
  await apiDelete(`teach/samples/${id}`);
};
export const updateLesson = (id: string, input: UpdateLessonInput) => apiPatch(`teach/lessons/${id}`, input, LessonSchema);
export const approveLessons = async (ids: string[]) => (await apiPost("teach/lessons/approve", { ids }, z.object({ approved: z.number().int() }))).approved;
export const setTeachEnabled = (enabled: boolean) => apiPut("teach/settings", { enabled }, TeachSettingsSchema);
/** Bộ quy tắc khai báo (.md) do máy chủ dựng từ bài học đang dùng. */
export async function downloadTeachRules(): Promise<{ blob: Blob; fileName: string }> {
  const res = await fetch("/api/teach/rules", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "quy-tac-khai-bao.md";
  return { blob: await res.blob(), fileName: name };
}
