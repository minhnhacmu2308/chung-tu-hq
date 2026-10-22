import { disconnectMailbox } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

// Gỡ kết nối hộp thư (email đã lấy vẫn ở hộp thư chứng từ).
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await disconnectMailbox(getContainer().mailbox, ctx, params.id!));
});
