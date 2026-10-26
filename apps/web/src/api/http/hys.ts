// HYS (hồ sơ đính kèm điện tử) – gọi backend thật. Cùng chữ ký với src/mocks/api/hys.ts.
import { HysOverviewSchema, HysSubmissionViewSchema, type CreateHysInput, type SendHysInput, type UpdateHysInput } from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/http";

const base = (dossierId: string) => `dossiers/${dossierId}/hys`;
const Ok = z.object({ ok: z.literal(true) });

export const getHysOverview = (dossierId: string) => apiGet(base(dossierId), HysOverviewSchema);
export const createHys = (dossierId: string, input: CreateHysInput) => apiPost(base(dossierId), input, HysSubmissionViewSchema);
export const updateHys = (dossierId: string, hysId: string, input: UpdateHysInput) => apiPatch(`${base(dossierId)}/${hysId}`, input, HysSubmissionViewSchema);
export const deleteHys = async (dossierId: string, hysId: string) => {
  await apiDelete(`${base(dossierId)}/${hysId}`, Ok);
};
export const uploadHysFiles = (dossierId: string, hysId: string, files: File[]) => {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  return apiUpload(`${base(dossierId)}/${hysId}/files`, form, HysSubmissionViewSchema);
};
export const removeHysFile = (dossierId: string, hysId: string, fileId: string) => apiDelete(`${base(dossierId)}/${hysId}/files/${fileId}`, HysSubmissionViewSchema);
export const sendHys = (dossierId: string, hysId: string, input: SendHysInput) => apiPost(`${base(dossierId)}/${hysId}/send`, input, HysSubmissionViewSchema);
