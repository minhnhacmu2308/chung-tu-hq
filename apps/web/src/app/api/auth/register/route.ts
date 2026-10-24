import { RegisterInputSchema } from "@kb/contracts";
import { register } from "@kb/core/modules/identity";
import { NextResponse } from "next/server";
import { clientIpOf, getContainer } from "@/container";
import { clearedCookieOptions, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/cookies";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const c = getContainer();
  const input = await parseBody(req, RegisterInputSchema);
  const { sessionToken, mode } = fromResult(await register(c.identity, input, { ip: clientIpOf(req) }));
  const res = NextResponse.json({ ok: true, mode });
  if (sessionToken) res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(c.env.APP_URL.startsWith("https")));
  return res;
});
