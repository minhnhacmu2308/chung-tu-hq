// GỠ LỖI TẠM (FPT_DEBUG_TRACE): nhật ký API FPT của một hồ sơ cho màn Truyền. Tắt → { enabled: false } (màn ẩn khung).
import type { FptTraceView } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { CustomsDeps } from "./customs-ports.js";

export async function getFptTrace(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<FptTraceView>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (!deps.fptTrace) return ok({ enabled: false, entries: [] });
  return ok({ enabled: true, entries: await deps.fptTrace.list(ctx.orgId, dossierId) });
}
