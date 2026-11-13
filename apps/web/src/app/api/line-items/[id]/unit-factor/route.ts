// Hệ số quy đổi theo lô của dòng hàng (packing list ghi khác mặc định); null = dùng hệ số mặc định của danh mục.
import { SetLineUnitFactorInputSchema } from "@kb/contracts";
import { setLineUnitFactor } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { factor } = await parseBody(req, SetLineUnitFactorInputSchema);
  return fromResult(await setLineUnitFactor(getContainer().declaration, ctx, params.id!, factor));
});
