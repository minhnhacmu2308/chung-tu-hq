// Chặn trang chưa đăng nhập khi dùng backend thật. Chế độ mock (demo) cho qua tất cả.
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/register", "/verify-email", "/reset-password", "/accept-invite", "/api/", "/_next/"];
const SESSION_COOKIE = "kb_session";

export function proxy(req: NextRequest): NextResponse {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) || /\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const login = new URL("/login", req.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|icons/).*)"] };
