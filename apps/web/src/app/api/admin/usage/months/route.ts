import { listUsageMonths } from "@kb/core/modules/admin";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => fromResult(await listUsageMonths(getContainer().admin, await requireStaff())));
