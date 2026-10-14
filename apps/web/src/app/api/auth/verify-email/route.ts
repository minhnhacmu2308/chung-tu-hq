import { VerifyEmailInputSchema } from "@kb/contracts";
import { verifyEmail } from "@kb/core/modules/identity";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const { token } = await parseBody(req, VerifyEmailInputSchema);
  fromResult(await verifyEmail(getContainer().identity, token));
  return { ok: true };
});
