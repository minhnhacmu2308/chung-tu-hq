// Hồ sơ khai báo – gọi backend thật. Cùng chữ ký với src/mocks/api/dossiers.ts.
import { DeleteDossierResultSchema, DossierDocumentSchema, DossierSchema, pageOf, type CreateDossierInput, type Dossier, type DossierFilter, type PageQuery } from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";

export type { CreateDossierInput, DossierFilter };

const qs = (f: DossierFilter, page?: PageQuery) => {
  const p = new URLSearchParams();
  if (f.direction) p.set("direction", f.direction);
  if (f.status) p.set("status", f.status);
  if (f.step) p.set("step", f.step);
  if (f.q) p.set("q", f.q);
  if (page) {
    p.set("limit", String(page.limit));
    p.set("offset", String(page.offset));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Danh sách không phân trang (server chặn trên 500 dòng, mới nhất trước). */
export const listDossiers = (f: DossierFilter = {}) => apiGet(`dossiers${qs(f)}`, z.array(DossierSchema));
/** Một trang hồ sơ + tổng – cho màn phân trang phía server. */
export const listDossiersPage = (f: DossierFilter, page: PageQuery) => apiGet(`dossiers${qs(f, page)}`, pageOf(DossierSchema));
export const getDossier = (id: string) => apiGet(`dossiers/${id}`, DossierSchema);
export const listDocuments = (dossierId: string) => apiGet(`dossiers/${dossierId}/documents`, z.array(DossierDocumentSchema));
export const createDossier = (input: CreateDossierInput) => apiPost("dossiers", input, DossierSchema);
export const updateDossier = (id: string, patch: Partial<Pick<Dossier, "status" | "step" | "suspectFields" | "note" | "declarationNo" | "channel">>) =>
  apiPatch(`dossiers/${id}`, { ...(patch.note !== undefined ? { note: patch.note } : {}), ...(patch.step ? { step: patch.step } : {}) }, DossierSchema);
export const cancelDossier = (id: string) => apiPost(`dossiers/${id}/cancel`, {}, DossierSchema);
export const deleteDossier = (id: string) => apiDelete(`dossiers/${id}`, DeleteDossierResultSchema);
