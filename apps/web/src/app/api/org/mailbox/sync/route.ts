import { requestMailSync } from "@kb/core/modules/mailbox";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

const SyncInput = z.object({ connectionId: z.string().min(1).optional() });

// "Lấy chứng từ mới": xếp job lấy thư cho mọi hộp thư (hoặc một hộp thư) – worker chạy nền.
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const { connectionId } = await parseBody(req, SyncInput);
  return fromResult(await requestMailSync(getContainer().mailbox, ctx, connectionId));
});
