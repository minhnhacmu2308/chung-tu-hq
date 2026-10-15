import { HsReclassifyInputSchema } from "@kb/contracts";
import { reclassifyHs } from "@kb/core/modules/declaration";
import { getContainer } from "@/container";
import { requireSession } from "@/lib/server/auth";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Phân loại lại một dòng (bổ sung mô tả / xuất xứ); tạo lượt mới qua job hs-reclassify. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, HsReclassifyInputSchema);
  return fromResult(await reclassifyHs(getContainer().declaration, ctx, params.id!, input));
});
