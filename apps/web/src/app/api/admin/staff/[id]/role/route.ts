import { changeStaffRole } from "@kb/core/modules/admin";
import { ChangeStaffRoleInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, p) => fromResult(await changeStaffRole(getContainer().admin, await requireStaff(), p.id!, await parseBody(req, ChangeStaffRoleInputSchema))));
