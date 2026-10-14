import { getUsageReport } from "@kb/core/modules/admin";
import { UsageMonthSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => fromResult(await getUsageReport(getContainer().admin, await requireStaff(), UsageMonthSchema.parse(req.nextUrl.searchParams.get("month")))));
