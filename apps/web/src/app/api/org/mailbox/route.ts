import { getMailboxOverview } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

// Hộp thư đã kết nối + nhà cung cấp nào máy chủ đã cấu hình OAuth.
export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await getMailboxOverview(getContainer().mailbox, ctx));
});
