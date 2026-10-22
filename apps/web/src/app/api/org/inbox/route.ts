import { listInbox } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

// Hộp thư chứng từ: email đã lấy về kèm file đính kèm + gợi ý hồ sơ.
export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await listInbox(getContainer().mailbox, ctx));
});
