import { ChangePasswordInputSchema } from "@kb/contracts";
import { changePassword } from "@kb/core/modules/identity";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getContainer } from "@/container";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/cookies";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Đổi mật khẩu khi đang đăng nhập (cả mật khẩu tạm bị bắt đổi): mọi phiên cũ bị hủy, đặt cookie phiên mới. */
export const POST = route(async (req) => {
  const c = getContainer();
  const input = await parseBody(req, ChangePasswordInputSchema);
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const { sessionToken } = fromResult(await changePassword(c.identity, token, input));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(c.env.APP_URL.startsWith("https")));
  return res;
});
