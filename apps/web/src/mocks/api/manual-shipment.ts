// Dữ liệu lô hàng nhập tay (ADR 0013 – Khai trước), mock. Backend: packages/core extraction/application/manual-shipment.ts
// (lưu → field_audit, gộp lại shipment, chạy luật, dựng lại tờ khai nháp); mock chỉ lưu và cập nhật trị giá hồ sơ.
import { canEditDeclaration, ManualShipmentSchema, type ManualShipmentInput, type ManualShipmentView } from "@kb/contracts";
import { ApiError, mutate, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { mulDecimal, sumDecimal } from "@/lib/decimal";

export const manualShipmentKeys = { detail: (dossierId: string) => ["manual-shipment", dossierId] as const };

const LOCKED = new Set(["APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"]);

function view(db: MockDb, dossierId: string, status: string): ManualShipmentView {
  const row = db.manualShipments[dossierId];
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  return { data: row?.data ?? null, updatedAt: row?.updatedAt ?? null, editable: !LOCKED.has(status) && !!role && canEditDeclaration(role) };
}

export const getManualShipment = (dossierId: string) =>
  query((db) => {
    const d = db.dossiers.find((x) => x.id === dossierId);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
    return view(db, d.id, d.status);
  });

export const saveManualShipment = (dossierId: string, input: ManualShipmentInput) =>
  mutate((db) => {
    const d = db.dossiers.find((x) => x.id === dossierId);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
    const role = db.members.find((m) => m.id === db.currentUserId)?.role;
    if (!role || !canEditDeclaration(role)) throw new ApiError("FORBIDDEN", "Vai trò của bạn không được sửa dữ liệu lô hàng", 403);
    if (LOCKED.has(d.status)) throw new ApiError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi sửa dữ liệu", 409);
    const data = ManualShipmentSchema.parse(input);
    db.manualShipments[d.id] = { data, updatedAt: nowIso(), updatedBy: db.currentUserId };
    if (data.items.length) d.invoiceValue = sumDecimal(data.items.map((it) => mulDecimal(it.quantity, it.unitPrice, 2)));
    if (data.invoice.currency) d.currency = data.invoice.currency.toUpperCase();
    return view(db, d.id, d.status);
  });
