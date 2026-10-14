import type { Dossier, DossierFilter } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { toDossier } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

export async function listDossiers(deps: DossierDeps, ctx: Ctx, filter: DossierFilter): Promise<Result<Dossier[]>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.dossiers.list(ctx.orgId, filter));
  return ok(rows.map(toDossier));
}
