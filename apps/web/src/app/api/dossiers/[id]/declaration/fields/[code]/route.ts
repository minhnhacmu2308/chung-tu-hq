import { UpdateDeclarationFieldInputSchema } from "@kb/contracts";
import { updateDeclarationField } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Sửa tay một chỉ tiêu (nguồn USER, ghi field_audit). */
export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { value } = await parseBody(req, UpdateDeclarationFieldInputSchema);
  return fromResult(await updateDeclarationField(getContainer().declaration, ctx, params.id!, params.code!, value));
});
