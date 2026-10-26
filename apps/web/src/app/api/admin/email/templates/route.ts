import { listEmailTemplates, saveEmailTemplate } from "@kb/core/modules/admin";
import { SaveEmailTemplateInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => fromResult(await listEmailTemplates(getContainer().admin, await requireStaff())));
export const POST = route(async (req) => fromResult(await saveEmailTemplate(getContainer().admin, await requireStaff(), null, await parseBody(req, SaveEmailTemplateInputSchema))));
