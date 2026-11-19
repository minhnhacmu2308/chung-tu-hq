import { UpdateFieldValuesInputSchema } from "@kb/contracts";
import { listFields, updateFieldValues } from "@kb/core/modules/extraction";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await listFields(getContainer().extraction, ctx, params.id!));
});

/** Sửa nhiều trường của hồ sơ một lần (1 transaction) – trường không thuộc hồ sơ → NOT_FOUND, không sửa trường nào. */
export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { edits } = await parseBody(req, UpdateFieldValuesInputSchema);
  return fromResult(await updateFieldValues(getContainer().extraction, ctx, params.id!, edits));
});
