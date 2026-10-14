import type { Ctx } from "../../../shared/ctx.js";
import { editField } from "./_field-edit.js";
import type { ExtractionDeps } from "./ports.js";

/** Bấm "Đúng": xác nhận giá trị AI đọc. */
export const confirmField = (deps: ExtractionDeps, ctx: Ctx, fieldId: string) =>
  editField(deps, ctx, fieldId, (f) => ({ value: f.value, status: "USER_CONFIRMED", source: "USER_CONFIRM" }));
