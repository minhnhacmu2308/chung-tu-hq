import type { DossierDocument } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { toDocument } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

export async function listDocuments(deps: DossierDeps, ctx: Ctx, dossierId: string): Promise<Result<DossierDocument[]>> {
  return deps.uow.asOrg(ctx, async (r) => {
    if (!(await r.dossiers.get(ctx.orgId, dossierId))) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    return ok((await r.documents.list(ctx.orgId, dossierId)).map(toDocument));
  });
}
