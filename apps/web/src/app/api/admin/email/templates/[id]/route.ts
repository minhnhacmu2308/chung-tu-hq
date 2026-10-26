import { deleteEmailTemplate, saveEmailTemplate } from "@kb/core/modules/admin";
import { SaveEmailTemplateInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req, p) => fromResult(await saveEmailTemplate(getContainer().admin, await requireStaff(), p.id!, await parseBody(req, SaveEmailTemplateInputSchema))));
export const DELETE = route(async (_req, p) => fromResult(await deleteEmailTemplate(getContainer().admin, await requireStaff(), p.id!)));
