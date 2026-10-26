import { deleteEmailSignature, saveEmailSignature } from "@kb/core/modules/admin";
import { SaveEmailSignatureInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req, p) => fromResult(await saveEmailSignature(getContainer().admin, await requireStaff(), p.id!, await parseBody(req, SaveEmailSignatureInputSchema))));
export const DELETE = route(async (_req, p) => fromResult(await deleteEmailSignature(getContainer().admin, await requireStaff(), p.id!)));
