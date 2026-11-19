import type { Ctx } from "../../../shared/ctx.js";
import { editFields } from "./_field-edit.js";
import type { ExtractionDeps } from "./ports.js";

/** Sửa giá trị nhiều trường cùng hồ sơ (vd áp xuất xứ cho các dòng đã chọn): 1 transaction, shipment ghi 1 lần, luật chạy 1 lần. Trùng id → lấy giá trị cuối (một ô một audit). */
export const updateFieldValues = (deps: ExtractionDeps, ctx: Ctx, dossierId: string, edits: readonly { id: string; value: string }[]) => {
  const last = new Map(edits.map((e) => [e.id, e.value.trim()]));
  return editFields(deps, ctx, [...last].map(([fieldId, value]) => ({ fieldId, change: () => ({ value, status: "USER_CONFIRMED" as const, source: "USER_EDIT" as const }) })), dossierId);
};
