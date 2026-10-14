import { dossierChannel, getDossier } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";
import { sseResponse } from "@/lib/server/sse";

export const dynamic = "force-dynamic";
/** SSE tiến trình hồ sơ: subscribe Redis channel của org+dossier (RLS: kiểm tra hồ sơ thuộc org trước). */
export const GET = route(async (req, params) => {
  const { ctx } = await requireSession();
  const c = getContainer();
  fromResult(await getDossier(c.dossier, ctx, params.id!));
  const channel = dossierChannel(ctx.orgId, params.id!);
  return sseResponse({
    subscribe: (onMessage) => {
      const sub = c.redis.duplicate();
      const handler = (ch: string, msg: string) => {
        if (ch === channel) onMessage(msg);
      };
      void sub.subscribe(channel).then(() => sub.on("message", handler));
      return () => {
        sub.off("message", handler);
        void sub.unsubscribe(channel).finally(() => sub.disconnect());
      };
    },
    onClose: (fn) => req.signal.addEventListener("abort", fn),
  });
});
