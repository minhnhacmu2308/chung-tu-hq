// Dùng chung cho sửa/xác nhận/hoàn tác một trường: ghi audit, cập nhật shipment, chạy lại luật, đếm nghi ngờ.
import type { ExtractedField, FieldStatus } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isReadLocked, normalizeEdit } from "../domain/edit-normalize.js";
import { toField } from "./_dto.js";
import { countSuspect, setSourced } from "./_remerge.js";
import type { AuditRow, ExtractionDeps, FieldRow } from "./ports.js";

export async function editField(
  deps: ExtractionDeps,
  ctx: Ctx,
  fieldId: string,
  change: (f: FieldRow) => { value: string; status: FieldStatus; source: AuditRow["source"] },
): Promise<Result<ExtractedField>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const org = await deps.documents.orgInfo(ctx.orgId);
  const pre = await deps.uow.asOrg(ctx, (r) => r.fields.get(fieldId));
  if (!pre) return err(domainError("NOT_FOUND", "Không tìm thấy trường"));
  if (isReadLocked(await deps.documents.dossierStatus(ctx.orgId, pre.dossierId))) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi sửa dữ liệu"));
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const f = await r.fields.get(fieldId);
    if (!f) return err(domainError("NOT_FOUND", "Không tìm thấy trường"));
    const next = change(f);
    if (next.source === "USER_EDIT") {
      const normalized = normalizeEdit(f.shipmentPath, next.value);
      if (normalized === null) return err(domainError("VALIDATION", `Giá trị "${next.value}" không hợp lệ cho ${f.label}`));
      if (normalized !== undefined) next.value = normalized;
    }
    const confirmed = next.status === "USER_CONFIRMED";
    await r.audit.insert({ id: deps.idGen.next("job"), orgId: ctx.orgId, dossierId: f.dossierId, fieldId: f.id, documentId: f.documentId, key: f.key, oldValue: f.value, newValue: next.value, userId: ctx.userId, source: next.source, at: now });
    await r.fields.update(f.id, { value: next.value, status: next.status, note: null, confirmedBy: confirmed ? ctx.userId : null, confirmedAt: confirmed ? now : null });
    const latest = await r.shipments.latest(f.dossierId);
    if (latest && f.shipmentPath) {
      setSourced(latest.data, f.shipmentPath, { value: next.value, status: next.status });
      await r.shipments.updateData(latest.id, latest.data);
    }
    const all = await r.fields.list(f.dossierId);
    return ok({ field: { ...f, value: next.value, status: next.status, note: null }, dossierId: f.dossierId, shipment: latest, suspect: countSuspect(all, org.suspectThreshold) });
  });
  if (!res.ok) return res;
  const { field, dossierId, shipment, suspect } = res.value;
  if (shipment) await deps.validation.run(ctx.orgId, dossierId, shipment.data, shipment.version, { taxCode: org.taxCode, name: org.name });
  const docs = await deps.documents.listForDossier(ctx.orgId, dossierId);
  await deps.documents.afterMerge(ctx.orgId, dossierId, { suspectFields: suspect, allDone: docs.every((d) => d.status === "DONE" || d.status === "ERROR") });
  await deps.documents.publish(ctx.orgId, dossierId, { type: "fields.updated" });
  return ok(toField(field));
}
