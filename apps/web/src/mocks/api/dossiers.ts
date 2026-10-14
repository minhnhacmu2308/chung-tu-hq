// Hồ sơ khai báo (mock). Thay thân hàm bằng fetch tới backend khi có API – giữ nguyên chữ ký.
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import type { Direction, Dossier, DossierDocument, DossierStatus, StepId } from "@/mocks/types";

export const dossierKeys = {
  all: ["dossiers"] as const,
  list: (f: DossierFilter) => ["dossiers", "list", f] as const,
  detail: (id: string) => ["dossiers", "detail", id] as const,
  documents: (id: string) => ["dossiers", "documents", id] as const,
};

export type DossierFilter = { direction?: Direction; status?: DossierStatus; step?: StepId };

export const listDossiers = (f: DossierFilter = {}) =>
  query((db) =>
    db.dossiers.filter(
      (d) => (!f.direction || d.direction === f.direction) && (!f.status || d.status === f.status) && (!f.step || d.step === f.step),
    ),
  );

export const getDossier = (id: string) =>
  query((db) => {
    const d = db.dossiers.find((x) => x.id === id);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    return d;
  });

export const listDocuments = (dossierId: string) => query((db) => db.documents.filter((d) => d.dossierId === dossierId));

import type { CreateDossierInput } from "@kb/contracts";
export type { CreateDossierInput };

export const createDossier = (input: CreateDossierInput) =>
  mutate((db) => {
    const n = 100 + db.dossiers.length;
    const ym = new Date().toISOString().slice(2, 7).replace("-", "");
    const d: Dossier = {
      id: newId("dos"),
      code: `HS-${input.direction}-${ym}-${n}`,
      direction: input.direction,
      typeCode: input.typeCode,
      partner: input.partner.trim().toUpperCase(),
      customsOffice: input.customsOffice,
      skillSetId: input.skillSetId,
      status: "DRAFT",
      step: "upload",
      dueDate: input.dueDate,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ownerId: db.currentUserId,
      invoiceValue: "0",
      currency: "USD",
      incoterm: input.incoterm,
      transportMode: input.transportMode,
      billNo: "",
      suspectFields: 0,
      ...(input.note ? { note: input.note } : {}),
    };
    db.dossiers.unshift(d);
    return d;
  });

export const updateDossier = (id: string, patch: Partial<Pick<Dossier, "status" | "step" | "suspectFields" | "note" | "declarationNo" | "channel">>) =>
  mutate((db) => {
    const d = db.dossiers.find((x) => x.id === id);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    Object.assign(d, patch, { updatedAt: nowIso() });
    return d;
  });

export const cancelDossier = (id: string) => updateDossier(id, { status: "CANCELLED" });

export type { Dossier, DossierDocument };
