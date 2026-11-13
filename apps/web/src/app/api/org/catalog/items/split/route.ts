// Tách các mã hàng (bí danh cùng một mặt hàng) sang mặt hàng mới (Quản trị/Chủ).
import { SplitAliasesInputSchema } from "@kb/contracts";
import { splitAliases } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await splitAliases(getContainer().catalog, ctx, await parseBody(req, SplitAliasesInputSchema)));
});
