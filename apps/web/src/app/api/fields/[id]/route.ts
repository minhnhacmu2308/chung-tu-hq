import { UpdateFieldValueInputSchema } from "@kb/contracts";
import { updateFieldValue } from "@kb/core/modules/extraction";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { value } = await parseBody(req, UpdateFieldValueInputSchema);
  return fromResult(await updateFieldValue(getContainer().extraction, ctx, params.id!, value));
});
