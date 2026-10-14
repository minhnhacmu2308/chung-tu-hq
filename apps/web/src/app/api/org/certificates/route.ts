import { AddCertificateInputSchema } from "@kb/contracts";
import { addCertificate, listCertificates } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await listCertificates(getContainer().identity, ctx));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await addCertificate(getContainer().identity, ctx, await parseBody(req, AddCertificateInputSchema)));
});
