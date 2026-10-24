// Bản khai bổ sung sau thông quan (AMA) – gọi backend thật. Cùng chữ ký với src/mocks/api/post-amendment.ts.
// `branch`: tờ khai nhánh (mỗi tờ một chuỗi bản khai), mặc định tờ 1.
import { CopyPostAmendmentHeaderResultSchema, PostAmendmentSchema, PostAmendmentViewSchema, type CopyPostAmendmentHeader, type UpdatePostAmendmentField } from "@kb/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";

const base = (dossierId: string) => `dossiers/${dossierId}/post-amendment`;

export const getPostAmendmentView = (dossierId: string, branch = 1) => apiGet(`${base(dossierId)}?branch=${branch}`, PostAmendmentViewSchema);
export const updatePostAmendmentField = (dossierId: string, input: UpdatePostAmendmentField, branch = 1) => apiPatch(`${base(dossierId)}/fields`, { ...input, branch }, PostAmendmentSchema);
export const addPostAmendmentLines = (dossierId: string, lineNos: number[], branch = 1) => apiPost(`${base(dossierId)}/lines`, { lineNos, branch }, PostAmendmentSchema);
export const removePostAmendmentLine = (dossierId: string, lineId: string, branch = 1) => apiDelete(`${base(dossierId)}/lines/${lineId}?branch=${branch}`, PostAmendmentSchema);
export const approvePostAmendment = (dossierId: string, branch = 1) => apiPost(`${base(dossierId)}/approve`, { branch }, PostAmendmentSchema);
export const copyPostAmendmentHeader = (dossierId: string, input: CopyPostAmendmentHeader) => apiPost(`${base(dossierId)}/copy-header`, input, CopyPostAmendmentHeaderResultSchema);
