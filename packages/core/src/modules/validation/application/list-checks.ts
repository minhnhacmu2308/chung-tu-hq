import type { CrossCheck } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import type { ValidationDeps } from "./ports.js";
import { toCrossCheck } from "./run-rules.js";

export async function listChecks(deps: ValidationDeps, ctx: Ctx, dossierId: string): Promise<Result<CrossCheck[]>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.validations.listLatest(ctx.orgId, dossierId));
  return ok(rows.map(toCrossCheck));
}
