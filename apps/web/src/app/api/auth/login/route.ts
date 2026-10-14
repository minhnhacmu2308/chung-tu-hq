import { LoginInputSchema } from "@kb/contracts";
import { login } from "@kb/core/modules/identity";
import { NextResponse } from "next/server";
import { getContainer } from "@/container";
import { clearedCookieOptions, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/cookies";
import { clientIp, fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const c = getContainer();
  const input = await parseBody(req, LoginInputSchema);
  const { sessionToken } = fromResult(await login(c.identity, input, { ip: clientIp(req) }));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(c.env.APP_URL.startsWith("https")));
  return res;
});
