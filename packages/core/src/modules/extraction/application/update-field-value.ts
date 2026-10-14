import type { Ctx } from "../../../shared/ctx.js";
import { editField } from "./_field-edit.js";
import type { ExtractionDeps } from "./ports.js";

/** Người dùng sửa giá trị → USER_CONFIRMED, giữ originalValue, ghi field_audit (B6). */
export const updateFieldValue = (deps: ExtractionDeps, ctx: Ctx, fieldId: string, value: string) =>
  editField(deps, ctx, fieldId, () => ({ value: value.trim(), status: "USER_CONFIRMED", source: "USER_EDIT" }));
