import type { Dossier } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { toDossier, withCustoms } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

export async function getDossier(deps: DossierDeps, ctx: Ctx, id: string): Promise<Result<Dossier>> {
  const d = await deps.uow.asOrg(ctx, (r) => r.dossiers.get(ctx.orgId, id));
  return d ? ok((await withCustoms(deps, ctx, [toDossier(d)]))[0]!) : err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
}
