// Bước 2–3: chứng từ, upload, trường trích xuất, đối chiếu chéo – gọi backend thật. Cùng chữ ký với src/mocks/api/ocr.ts.
import { CrossCheckSchema, DossierDocumentSchema, DossierSchema, ExtractedFieldSchema, OkSchema, type DocKind, DocumentSheetSchema } from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/http";

export const listDossierDocuments = (dossierId: string) => apiGet(`dossiers/${dossierId}/documents`, z.array(DossierDocumentSchema));

/** Upload nhiều file (multipart). Backend tự đoán loại theo tên file rồi AI phân loại lại. */
export const uploadDocuments = (dossierId: string, files: File[]) => {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  return apiUpload(`dossiers/${dossierId}/documents`, form, z.array(DossierDocumentSchema));
};
export const changeDocumentKind = (documentId: string, kind: DocKind) => apiPatch(`documents/${documentId}/kind`, { kind }, DossierDocumentSchema);
export const deleteDocument = async (documentId: string) => {
  await apiDelete(`documents/${documentId}`, OkSchema);
};
export const retryDocument = async (documentId: string) => {
  await apiPost(`documents/${documentId}/retry`, {}, OkSchema);
};
export const listFields = (dossierId: string) => apiGet(`dossiers/${dossierId}/fields`, z.array(ExtractedFieldSchema));
export const listDocumentSheets = (dossierId: string) => apiGet(`dossiers/${dossierId}/document-sheets`, z.array(DocumentSheetSchema));
/** Tải file Excel bảng đọc chứng từ do máy chủ dựng. */
export async function downloadDocumentSheets(dossierId: string): Promise<Blob> {
  const res = await fetch(`/api/dossiers/${dossierId}/export.xlsx`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(res.status === 404 ? "Chưa có chứng từ đọc xong để xuất" : `Không xuất được Excel (HTTP ${res.status})`);
  return res.blob();
}
export const listChecks = (dossierId: string) => apiGet(`dossiers/${dossierId}/checks`, z.array(CrossCheckSchema));
export const updateFieldValue = (fieldId: string, value: string) => apiPatch(`fields/${fieldId}`, { value }, ExtractedFieldSchema);
export const confirmField = (fieldId: string) => apiPost(`fields/${fieldId}/confirm`, {}, ExtractedFieldSchema);
export const revertField = (fieldId: string) => apiPost(`fields/${fieldId}/revert`, {}, ExtractedFieldSchema);
export const finishReading = (dossierId: string) => apiPost(`dossiers/${dossierId}/finish-reading`, {}, DossierSchema);
