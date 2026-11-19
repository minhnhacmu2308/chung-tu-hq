// Dùng chung cho sửa/xác nhận/hoàn tác một hoặc nhiều trường (editFields – 1 transaction): ghi audit, cập nhật shipment, chạy lại luật, cập nhật tờ khai nháp, đếm nghi ngờ.
import { isReadOnlyField, type ExtractedField, type FieldStatus } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isReadLocked, normalizeEdit } from "../domain/edit-normalize.js";
import { sheetScopeError } from "./_edit-scope.js";
import { toField } from "./_dto.js";
import { countSuspect, setSourced } from "./_remerge.js";
import type { AuditRow, ExtractionDeps, FieldRow } from "./ports.js";

type Change = (f: FieldRow) => { value: string; status: FieldStatus; source: AuditRow["source"] };

export async function editField(deps: ExtractionDeps, ctx: Ctx, fieldId: string, change: Change): Promise<Result<ExtractedField>> {
  const res = await editFields(deps, ctx, [{ fieldId, change }]);
  return res.ok ? ok(res.value[0]!) : res;
}

/**
 * Sửa nhiều trường CÙNG hồ sơ trong 1 transaction: shipment đọc/ghi 1 lần, luật chạy 1 lần. Gọi editField song song cho từng
 * trường thì mỗi lần đọc shipment cũ rồi ghi đè cả khối → chỉ lần ghi cuối còn lại (vd áp xuất xứ cho nhiều dòng chỉ ăn 1 dòng).
 * `dossierId`: chỉ nhận trường của hồ sơ này (route hàng loạt); một trường lỗi → không sửa trường nào.
 */
export async function editFields(
  deps: ExtractionDeps,
  ctx: Ctx,
  edits: readonly { fieldId: string; change: Change }[],
  dossierId?: string,
): Promise<Result<ExtractedField[]>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  if (edits.length === 0) return ok([]);
  const now = deps.clock.now();
  const org = await deps.documents.orgInfo(ctx.orgId);
  const pres = await deps.uow.asOrg(ctx, (r) => Promise.all(edits.map((e) => r.fields.get(ctx.orgId, e.fieldId))));
  if (pres.some((p) => !p) || (dossierId && pres.some((p) => p!.dossierId !== dossierId))) return err(domainError("NOT_FOUND", "Không tìm thấy trường"));
  const target = pres[0]!.dossierId;
  if (pres.some((p) => p!.dossierId !== target)) return err(domainError("VALIDATION", "Chỉ sửa hàng loạt các trường cùng một hồ sơ"));
  if (isReadLocked(await deps.documents.dossierStatus(ctx.orgId, target))) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi sửa dữ liệu"));
  for (const key of new Set(pres.map((p) => p!.key))) {
    const blocked = await sheetScopeError(deps, ctx, target, key);
    if (blocked) return err(blocked);
  }
  const res = await deps.uow.asOrg(ctx, async (r) => {
    // Bước 1: đọc + kiểm MỌI ô trước khi ghi – trả err trong callback vẫn commit transaction, nên không được ghi dở rồi mới báo lỗi.
    const planned: { f: FieldRow; next: ReturnType<Change> }[] = [];
    for (const e of edits) {
      const f = await r.fields.get(ctx.orgId, e.fieldId);
      if (!f) return err(domainError("NOT_FOUND", "Không tìm thấy trường"));
      const next = e.change(f);
      if (next.source === "USER_EDIT") {
        if (isReadOnlyField(f.key)) return err(domainError("VALIDATION", `${f.label} không sửa ở đây – sửa trong thẻ nhập tay lô hàng`));
        const normalized = normalizeEdit(f.shipmentPath, next.value);
        if (normalized === null) return err(domainError("VALIDATION", `Giá trị "${next.value}" không hợp lệ cho ${f.label}`));
        if (normalized !== undefined) next.value = normalized;
      }
      planned.push({ f, next });
    }
    // Bước 2: ghi – audit cùng transaction (bất biến 6), shipment cập nhật trong bộ nhớ rồi ghi 1 lần.
    const latest = await r.shipments.latest(ctx.orgId, target);
    const saved: FieldRow[] = [];
    let shipmentChanged = false;
    for (const { f, next } of planned) {
      const confirmed = next.status === "USER_CONFIRMED";
      await r.audit.insert({ id: deps.idGen.next("job"), orgId: ctx.orgId, dossierId: f.dossierId, fieldId: f.id, documentId: f.documentId, key: f.key, oldValue: f.value, newValue: next.value, userId: ctx.userId, source: next.source, at: now });
      await r.fields.update(ctx.orgId, f.id, { value: next.value, status: next.status, note: null, confirmedBy: confirmed ? ctx.userId : null, confirmedAt: confirmed ? now : null });
      if (latest && f.shipmentPath) {
        setSourced(latest.data, f.shipmentPath, { value: next.value, status: next.status });
        shipmentChanged = true;
      }
      saved.push({ ...f, value: next.value, status: next.status, note: null });
    }
    if (latest && shipmentChanged) await r.shipments.updateData(ctx.orgId, latest.id, latest.data);
    const all = await r.fields.list(ctx.orgId, target);
    // Như trước: có shipment là chạy lại luật (kể cả trường không gắn đường dẫn shipment)
    return ok({ fields: saved, shipment: latest, suspect: countSuspect(all, org.suspectThreshold) });
  });
  if (!res.ok) return res;
  const { fields, shipment, suspect } = res.value;
  if (shipment) await deps.validation.run(ctx.orgId, target, shipment.data, shipment.version, { taxCode: org.taxCode, name: org.name });
  if (shipment) await deps.onShipmentEdited?.(ctx.orgId, target);
  const docs = await deps.documents.listForDossier(ctx.orgId, target);
  await deps.documents.afterMerge(ctx.orgId, target, { suspectFields: suspect, allDone: docs.every((d) => d.status === "DONE" || d.status === "ERROR") });
  await deps.documents.publish(ctx.orgId, target, { type: "fields.updated" });
  return ok(fields.map(toField));
}
