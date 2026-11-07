import { adjustOrgCredits, listOrgCredits } from "@kb/core/modules/admin";
import { AdjustOrgCreditsInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Sổ lượt + thanh toán gần đây + số dư của doanh nghiệp. */
export const GET = route(async (_req, p) => fromResult(await listOrgCredits(getContainer().admin, await requireStaff(), p.id!)));
/** Nạp/tặng/hoàn/điều chỉnh lượt tay – ghi nhật ký ORG_CREDITS_ADJUSTED. */
export const POST = route(async (req, p) => fromResult(await adjustOrgCredits(getContainer().admin, await requireStaff(), p.id!, await parseBody(req, AdjustOrgCreditsInputSchema))));
