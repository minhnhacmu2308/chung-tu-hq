import type { Dossier, DossierDocument } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import type { DocumentRow, DossierDeps, DossierRow } from "./ports.js";

export function toDossier(r: DossierRow): Dossier {
  return {
    id: r.id, code: r.code, direction: r.direction, typeCode: r.typeCode, partner: r.partner,
    customsOffice: r.customsOfficeName ? `${r.customsOfficeCode} – ${r.customsOfficeName}` : r.customsOfficeCode,
    skillSetId: r.skillSetId, status: r.status, step: r.step, dueDate: r.dueDate, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    ownerId: r.ownerId, invoiceValue: r.invoiceValue, currency: r.currency, incoterm: r.incoterm, transportMode: r.transportMode, partyClass: r.partyClass, billNo: r.billNo,
    suspectFields: r.suspectFields,
    ...(r.note ? { note: r.note } : {}),
    ...(r.declarationNo ? { declarationNo: r.declarationNo } : {}),
    ...(r.channel ? { channel: r.channel as Dossier["channel"] } : {}),
  };
}

/** Gắn tóm tắt Hải quan ("Thông quan k/N") – một lần gọi cổng cho cả danh sách. */
export async function withCustoms(deps: Pick<DossierDeps, "customs">, ctx: Ctx, list: Dossier[]): Promise<Dossier[]> {
  if (!deps.customs || !list.length) return list;
  const map = await deps.customs.summaries(ctx, list.map((d) => d.id));
  return list.map((d) => {
    const customs = map.get(d.id);
    return customs ? { ...d, customs } : d;
  });
}

export function toDocument(r: DocumentRow): DossierDocument {
  return { id: r.id, dossierId: r.dossierId, kind: r.kind, fileName: r.fileName, sizeBytes: r.sizeBytes, pages: r.pages, status: r.status, ...(r.error ? { error: r.error } : {}), uploadedAt: r.createdAt.toISOString() };
}

/** "03CE – Chi cục HQ CK cảng Hải Phòng KV III" → { code, name }. */
export function splitCustomsOffice(s: string): { code: string; name: string } {
  const m = /^([A-Z0-9]{2,6})\s*[–-]\s*(.+)$/.exec(s.trim());
  return m ? { code: m[1]!, name: m[2]!.trim() } : { code: s.trim(), name: "" };
}
