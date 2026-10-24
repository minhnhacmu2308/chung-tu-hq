import { SetInboxMessageStatusInputSchema } from "@kb/contracts";
import { setInboxMessageStatus } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

// Bỏ qua email / đưa lại về "Mới".
export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { status } = await parseBody(req, SetInboxMessageStatusInputSchema);
  return fromResult(await setInboxMessageStatus(getContainer().mailbox, ctx, params.id!, status));
});
