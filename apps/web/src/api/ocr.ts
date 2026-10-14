// Bước 2–3: chứng từ, trường trích xuất, đối chiếu. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/ocr";
import * as http from "./http/ocr";

export const ocrKeys = mock.ocrKeys;
export const isSuspect = mock.isSuspect;
export const classifyByFileName = mock.classifyByFileName;

export const listDossierDocuments = pick(mock.listDossierDocuments, http.listDossierDocuments);
export const uploadDocuments = pick(mock.uploadDocuments, http.uploadDocuments);
export const changeDocumentKind = pick(mock.changeDocumentKind, http.changeDocumentKind);
export const deleteDocument = pick(mock.deleteDocument, http.deleteDocument);
export const retryDocument = pick(mock.retryDocument, http.retryDocument);
export const listFields = pick(mock.listFields, http.listFields);
export const listChecks = pick(mock.listChecks, http.listChecks);
export const updateFieldValue = pick(mock.updateFieldValue, http.updateFieldValue);
export const confirmField = pick(mock.confirmField, http.confirmField);
export const revertField = pick(mock.revertField, http.revertField);
export const finishReading = pick(mock.finishReading, http.finishReading);
