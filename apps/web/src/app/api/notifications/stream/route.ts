import { notificationEventFor } from "@kb/core/shared";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { route } from "@/lib/server/route";
import { sseResponse } from "@/lib/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * SSE thông báo realtime (ADR 0017): một kết nối Redis SUBSCRIBE dùng chung cả tiến trình (`notificationHub`), mỗi luồng
 * chỉ nhận sự kiện của chính người dùng trong chính doanh nghiệp của phiên. Header chống đệm (X-Accel-Buffering) có trong sseResponse.
 */
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const hub = getContainer().notificationHub;
  return sseResponse({
    subscribe: (onMessage) =>
      hub.subscribe((raw) => {
        const e = notificationEventFor(ctx, raw);
        if (e) onMessage(JSON.stringify(e));
      }),
    onClose: (fn) => req.signal.addEventListener("abort", fn),
    heartbeatMs: 25_000,
    retryMs: 5_000,
  });
});
