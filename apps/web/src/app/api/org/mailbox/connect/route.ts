import { StartMailConnectInputSchema } from "@kb/contracts";
import { startMailConnect } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

// Bước 1 kết nối hộp thư: trả URL trang đồng ý của Google / Microsoft (trình duyệt tự chuyển tới).
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const { provider } = await parseBody(req, StartMailConnectInputSchema);
  return fromResult(await startMailConnect(getContainer().mailbox, ctx, provider));
});
