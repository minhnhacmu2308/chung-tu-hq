// Gộp lại toàn bộ hồ sơ từ các extraction DONE: shipment version mới, chiếu trường (giữ USER_CONFIRMED), chạy luật, cập nhật hồ sơ.
import { EXTRACTION_SCHEMA_VERSION, type Shipment, type Sourced } from "@kb/contracts";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { isSuspect } from "../domain/field-status.js";
import { mergeExtractions, type FileExtraction } from "../domain/merge.js";
import { isValidTaxCode } from "../domain/normalize.js";
import { projectFields } from "../domain/project-fields.js";
import type { ExtractionDeps, ExtractionRepos, FieldRow } from "./ports.js";

export function setSourced(s: Shipment, path: string, patch: Partial<Sourced<string>>) {
  let cur: unknown = s;
  const parts = path.split("/").filter(Boolean);
  for (const p of parts.slice(0, -1)) cur = (cur as Record<string, unknown>)[p];
  const leaf = (cur as Record<string, Sourced<string>>)[parts[parts.length - 1]!];
  if (leaf) Object.assign(leaf, patch);
}

/** Đếm trường nghi ngờ theo ngưỡng org. */
export const countSuspect = (rows: { status: FieldRow["status"] }[], threshold: "STRICT" | "BALANCED" | "RELAXED") => rows.filter((f) => isSuspect(f.status, threshold)).length;

export async function remergeDossier(deps: ExtractionDeps, orgId: string, dossierId: string): Promise<void> {
  const org = await deps.documents.orgInfo(orgId);
  const docsAll = await deps.documents.listForDossier(orgId, dossierId);
  const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
  const result = await deps.uow.asOrg(ctx, async (r: ExtractionRepos) => {
    await r.lockDossier(dossierId);
    const done = docsAll.filter((d) => d.status === "DONE");
    const rows = await r.extractions.listDone(dossierId, done.map((d) => d.id));
    // Mỗi chứng từ lấy extraction mới nhất khớp loại hiện tại.
    const files: FileExtraction[] = done.flatMap((d) => {
      const mine = rows.filter((x) => x.documentId === d.id && x.kind === d.kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const latest = mine[0];
      return latest ? [{ documentId: d.id, kind: d.kind, pages: d.pages, data: latest.raw as Record<string, unknown>, ...(latest.regions ? { regions: latest.regions } : {}) }] : [];
    });
    const latestShipment = await r.shipments.latest(dossierId);
    const version = (latestShipment?.version ?? 0) + 1;
    const shipment = mergeExtractions(files, { version, taxCodeValid: isValidTaxCode });

    const existing = await r.fields.list(dossierId);
    const byKey = new Map(existing.map((f) => [`${f.documentId}:${f.key}`, f]));
    const now = deps.clock.now();
    const fieldRows: FieldRow[] = projectFields(shipment).map((p) => {
      const prev = byKey.get(`${p.documentId}:${p.key}`);
      const keepUser = prev?.status === "USER_CONFIRMED";
      if (keepUser && p.shipmentPath) setSourced(shipment, p.shipmentPath, { value: prev.value, status: "USER_CONFIRMED" });
      return {
        id: prev?.id ?? deps.idGen.next("fld"), orgId, dossierId, documentId: p.documentId, group: p.group, key: p.key, label: p.label,
        value: keepUser ? prev.value : p.value, originalValue: prev?.originalValue ?? p.value, status: keepUser ? "USER_CONFIRMED" : p.status,
        region: p.region ?? prev?.region ?? null, note: keepUser ? null : (p.note ?? null), shipmentPath: p.shipmentPath,
        confirmedBy: keepUser ? prev.confirmedBy : null, confirmedAt: keepUser ? prev.confirmedAt : null,
      };
    });
    await r.fields.replaceForDossier(dossierId, fieldRows);
    await r.shipments.insert({ id: deps.idGen.next("job"), orgId, dossierId, version, data: shipment, schemaVersion: String(EXTRACTION_SCHEMA_VERSION), createdAt: now });
    return { shipment, version, suspect: countSuspect(fieldRows, org.suspectThreshold) };
  });
  await deps.validation.run(orgId, dossierId, result.shipment, result.version, { taxCode: org.taxCode, name: org.name });
  const inv = result.shipment.invoice;
  const { finishedNow } = await deps.documents.afterMerge(orgId, dossierId, {
    suspectFields: result.suspect,
    ...(inv.totalAmount.value ? { invoiceValue: inv.totalAmount.value } : {}),
    ...(inv.currency.value ? { currency: inv.currency.value } : {}),
    ...(result.shipment.transport.billNo.value ? { billNo: result.shipment.transport.billNo.value } : {}),
    allDone: docsAll.every((d) => d.status === "DONE" || d.status === "ERROR"),
  });
  // Chỉ báo một lần khi hồ sơ vừa đọc xong; chạy lại job / gộp lại sau khi xóa chứng từ không báo nữa.
  if (finishedNow) await deps.notify?.notify(orgId, { dossierOwnerOf: dossierId }, { title: "Đã đọc xong bộ chứng từ", body: `${result.suspect} trường cần kiểm tra – vào bước OCR & kiểm tra để xác nhận.`, href: `/dossiers/${dossierId}?step=ocr` });
  await deps.documents.publish(orgId, dossierId, { type: "fields.updated" });
}
