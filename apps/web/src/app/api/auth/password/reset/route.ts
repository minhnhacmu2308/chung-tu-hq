import { ResetPasswordInputSchema } from "@kb/contracts";
import { resetPassword } from "@kb/core/modules/identity";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const input = await parseBody(req, ResetPasswordInputSchema);
  fromResult(await resetPassword(getContainer().identity, input));
  return { ok: true };
});
