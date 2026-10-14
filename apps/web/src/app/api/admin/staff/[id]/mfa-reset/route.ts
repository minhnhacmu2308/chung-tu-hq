import { AdminReasonInputSchema } from "@kb/contracts";
import { resetStaffMfa } from "@kb/core/modules/admin";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req, p) => fromResult(await resetStaffMfa(getContainer().admin, await requireStaff(), p.id!, await parseBody(req, AdminReasonInputSchema))));
