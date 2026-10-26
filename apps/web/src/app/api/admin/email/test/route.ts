import { sendTestEmail } from "@kb/core/modules/admin";
import { SendTestEmailInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => fromResult(await sendTestEmail(getContainer().admin, await requireStaff(), await parseBody(req, SendTestEmailInputSchema))));
