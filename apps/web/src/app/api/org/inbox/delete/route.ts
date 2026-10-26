import { DeleteInboxMessagesInputSchema } from "@kb/contracts";
import { deleteInboxMessages } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

// Xóa email đã chọn khỏi hộp thư chứng từ.
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const { ids } = await parseBody(req, DeleteInboxMessagesInputSchema);
  return fromResult(await deleteInboxMessages(getContainer().mailbox, ctx, ids));
});
