// Hồ sơ khai báo – gọi backend thật. Cùng chữ ký với src/mocks/api/dossiers.ts.
import { DossierDocumentSchema, DossierSchema, type CreateDossierInput, type Dossier, type DossierFilter } from "@kb/contracts";
import { z } from "zod";
import { apiGet, apiPatch, apiPost } from "@/lib/http";

export type { CreateDossierInput, DossierFilter };

const qs = (f: DossierFilter) => {
  const p = new URLSearchParams();
  if (f.direction) p.set("direction", f.direction);
  if (f.status) p.set("status", f.status);
  if (f.step) p.set("step", f.step);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const listDossiers = (f: DossierFilter = {}) => apiGet(`dossiers${qs(f)}`, z.array(DossierSchema));
export const getDossier = (id: string) => apiGet(`dossiers/${id}`, DossierSchema);
export const listDocuments = (dossierId: string) => apiGet(`dossiers/${dossierId}/documents`, z.array(DossierDocumentSchema));
export const createDossier = (input: CreateDossierInput) => apiPost("dossiers", input, DossierSchema);
export const updateDossier = (id: string, patch: Partial<Pick<Dossier, "status" | "step" | "suspectFields" | "note" | "declarationNo" | "channel">>) =>
  apiPatch(`dossiers/${id}`, { ...(patch.note !== undefined ? { note: patch.note } : {}), ...(patch.step ? { step: patch.step } : {}) }, DossierSchema);
export const cancelDossier = (id: string) => apiPost(`dossiers/${id}/cancel`, {}, DossierSchema);
