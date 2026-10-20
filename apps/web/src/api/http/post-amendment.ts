// Bản khai bổ sung sau thông quan (AMA) – gọi backend thật. Cùng chữ ký với src/mocks/api/post-amendment.ts.
import { PostAmendmentSchema, PostAmendmentViewSchema, type UpdatePostAmendmentField } from "@kb/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";

const base = (dossierId: string) => `dossiers/${dossierId}/post-amendment`;

export const getPostAmendmentView = (dossierId: string) => apiGet(base(dossierId), PostAmendmentViewSchema);
export const updatePostAmendmentField = (dossierId: string, input: UpdatePostAmendmentField) => apiPatch(`${base(dossierId)}/fields`, input, PostAmendmentSchema);
export const addPostAmendmentLines = (dossierId: string, lineNos: number[]) => apiPost(`${base(dossierId)}/lines`, { lineNos }, PostAmendmentSchema);
export const removePostAmendmentLine = (dossierId: string, lineId: string) => apiDelete(`${base(dossierId)}/lines/${lineId}`, PostAmendmentSchema);
export const approvePostAmendment = (dossierId: string) => apiPost(`${base(dossierId)}/approve`, {}, PostAmendmentSchema);
