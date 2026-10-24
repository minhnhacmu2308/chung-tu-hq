import { completeMailConnect } from "@kb/core/modules/mailbox";
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { HttpError, route } from "@/lib/server/route";

/**
 * Callback OAuth của Google / Microsoft (redirect URI khai báo ở Google Cloud / Azure: `${APP_URL}/api/mailbox/oauth/callback`).
 * Luôn chuyển hướng về trang Cài đặt → Tích hợp kèm kết quả (giao diện tự dịch theo mã lý do), không trả JSON.
 */
export const dynamic = "force-dynamic";
export const GET = route(async (req: NextRequest) => {
  const base = getContainer().env.APP_URL;
  const back = (q: Record<string, string>) => NextResponse.redirect(new URL(`/settings?${new URLSearchParams({ tab: "integrations", ...q }).toString()}`, base), 302);
  let ctx;
  try {
    ({ ctx } = await requireSession());
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    // Hết phiên giữa chừng: đăng nhập lại rồi quay lại đúng callback (code còn hạn vài phút).
    const login = new URL("/login", base);
    login.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login, 302);
  }
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  const state = q.get("state");
  // Người dùng bấm "Hủy" ở trang đồng ý (error=access_denied) hoặc thiếu tham số.
  if (q.get("error") || !code || !state) return back({ mailbox: "error", reason: "MAILBOX_AUTH_FAILED" });
  const r = await completeMailConnect(getContainer().mailbox, ctx, { code, state });
  if (!r.ok) {
    const provider = (r.error.params as { provider?: unknown } | undefined)?.provider;
    return back({ mailbox: "error", reason: r.error.reason ?? r.error.code, ...(typeof provider === "string" ? { provider } : {}) });
  }
  return back({ mailbox: "connected", email: r.value.email });
});
