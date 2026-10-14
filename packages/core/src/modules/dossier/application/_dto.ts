import type { Dossier, DossierDocument } from "@kb/contracts";
import type { DocumentRow, DossierRow } from "./ports.js";

export function toDossier(r: DossierRow): Dossier {
  return {
    id: r.id, code: r.code, direction: r.direction, typeCode: r.typeCode, partner: r.partner,
    customsOffice: r.customsOfficeName ? `${r.customsOfficeCode} – ${r.customsOfficeName}` : r.customsOfficeCode,
    skillSetId: r.skillSetId, status: r.status, step: r.step, dueDate: r.dueDate, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    ownerId: r.ownerId, invoiceValue: r.invoiceValue, currency: r.currency, incoterm: r.incoterm, transportMode: r.transportMode, billNo: r.billNo,
    suspectFields: r.suspectFields,
    ...(r.note ? { note: r.note } : {}),
    ...(r.declarationNo ? { declarationNo: r.declarationNo } : {}),
    ...(r.channel ? { channel: r.channel as Dossier["channel"] } : {}),
  };
}

export function toDocument(r: DocumentRow): DossierDocument {
  return { id: r.id, dossierId: r.dossierId, kind: r.kind, fileName: r.fileName, sizeBytes: r.sizeBytes, pages: r.pages, status: r.status, ...(r.error ? { error: r.error } : {}), uploadedAt: r.createdAt.toISOString() };
}

/** "03CE – Chi cục HQ CK cảng Hải Phòng KV III" → { code, name }. */
export function splitCustomsOffice(s: string): { code: string; name: string } {
  const m = /^([A-Z0-9]{2,6})\s*[–-]\s*(.+)$/.exec(s.trim());
  return m ? { code: m[1]!, name: m[2]!.trim() } : { code: s.trim(), name: "" };
}
