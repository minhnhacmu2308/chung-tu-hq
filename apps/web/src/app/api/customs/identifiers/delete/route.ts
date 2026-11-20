import { IdentifierDeleteSchema } from "@kb/contracts";
import { deleteIdentifiers } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Xóa mềm các dòng bị từ chối / không phản hồi chưa có số. */
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const { ids } = await parseBody(req, IdentifierDeleteSchema);
  return fromResult(await deleteIdentifiers(getContainer().customs, ctx, ids));
});
