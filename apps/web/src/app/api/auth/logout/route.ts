import { logout } from "@kb/core/modules/identity";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getContainer } from "@/container";
import { clearedCookieOptions, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/cookies";
import { clientIp, fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async () => {
  const c = getContainer();
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  fromResult(await logout(c.identity, token));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", clearedCookieOptions(c.env.APP_URL.startsWith("https")));
  return res;
});
