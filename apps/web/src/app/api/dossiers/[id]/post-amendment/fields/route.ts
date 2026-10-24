import { BranchQuerySchema, UpdatePostAmendmentFieldSchema } from "@kb/contracts";
import { updatePostAmendmentField } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Sửa một ô của bản khai bổ sung (đầu bản khai hoặc dòng hàng – `lineId`); ghi field_audit; tờ `branch` (mặc định 1). */
export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { branch, ...input } = await parseBody(req, UpdatePostAmendmentFieldSchema.merge(BranchQuerySchema));
  return fromResult(await updatePostAmendmentField(getContainer().customs, ctx, params.id!, input, branch));
});
