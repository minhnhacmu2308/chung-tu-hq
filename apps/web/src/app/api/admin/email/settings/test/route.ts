import { testMailSettings } from "@kb/core/modules/admin";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const POST = route(async () => fromResult(await testMailSettings(getContainer().admin, await requireStaff())));
