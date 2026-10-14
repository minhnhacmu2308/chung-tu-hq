import type { ExtractedField } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { toField } from "./_dto.js";
import type { ExtractionDeps } from "./ports.js";

export async function listFields(deps: ExtractionDeps, ctx: Ctx, dossierId: string): Promise<Result<ExtractedField[]>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.fields.list(dossierId));
  return ok(rows.map(toField));
}
