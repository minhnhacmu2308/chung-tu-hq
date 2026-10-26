import { listEmailCampaigns, sendEmail } from "@kb/core/modules/admin";
import { SendEmailInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => fromResult(await listEmailCampaigns(getContainer().admin, await requireStaff())));
/** Tạo đợt gửi – worker gửi dần (job email-campaign). */
export const POST = route(async (req) => fromResult(await sendEmail(getContainer().admin, await requireStaff(), await parseBody(req, SendEmailInputSchema))));
