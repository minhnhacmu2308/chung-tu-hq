import { ForgotPasswordInputSchema } from "@kb/contracts";
import { requestPasswordReset } from "@kb/core/modules/identity";
import { getContainer } from "@/container";
import { clientIp, fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const { email } = await parseBody(req, ForgotPasswordInputSchema);
  fromResult(await requestPasswordReset(getContainer().identity, email, { ip: clientIp(req) }));
  return { ok: true };
});
