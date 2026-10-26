// Hồ sơ khai báo. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/dossiers";
import * as http from "./http/dossiers";

export const dossierKeys = mock.dossierKeys;
export type { CreateDossierInput, DossierFilter } from "@kb/contracts";
export type { Dossier, DossierDocument } from "@kb/contracts";

export const listDossiers = pick(mock.listDossiers, http.listDossiers);
export const listDossiersPage = pick(mock.listDossiersPage, http.listDossiersPage);
export const getDossier = pick(mock.getDossier, http.getDossier);
export const listDocuments = pick(mock.listDocuments, http.listDocuments);
export const createDossier = pick(mock.createDossier, http.createDossier);
export const updateDossier = pick(mock.updateDossier, http.updateDossier);
export const cancelDossier = pick(mock.cancelDossier, http.cancelDossier);
export const deleteDossier = pick(mock.deleteDossier, http.deleteDossier);
