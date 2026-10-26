import { listEmailSignatures, saveEmailSignature } from "@kb/core/modules/admin";
import { SaveEmailSignatureInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => fromResult(await listEmailSignatures(getContainer().admin, await requireStaff())));
export const POST = route(async (req) => fromResult(await saveEmailSignature(getContainer().admin, await requireStaff(), null, await parseBody(req, SaveEmailSignatureInputSchema))));
