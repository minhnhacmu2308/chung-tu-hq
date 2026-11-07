// Gói & sử dụng (ADR 0011): gói, số dư lượt, lượt đang giữ/khả dụng, hợp đồng, 50 dòng sổ lượt, thanh toán gần đây.
import { getBillingOverview } from "@kb/core/modules/billing";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await getBillingOverview(getContainer().billing, ctx));
});
