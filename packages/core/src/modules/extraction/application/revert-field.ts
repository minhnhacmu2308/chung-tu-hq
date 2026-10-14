import type { Ctx } from "../../../shared/ctx.js";
import { editField } from "./_field-edit.js";
import type { ExtractionDeps } from "./ports.js";

/** Hoàn tác về giá trị AI đọc ban đầu; đánh dấu cần xem lại. */
export const revertField = (deps: ExtractionDeps, ctx: Ctx, fieldId: string) =>
  editField(deps, ctx, fieldId, (f) => ({ value: f.originalValue, status: "MODEL_UNSURE", source: "USER_REVERT" }));
