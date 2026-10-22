import { AddInboxToDossierInputSchema } from "@kb/contracts";
import { addInboxToDossier } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

// Xếp file đính kèm đã chọn vào hồ sơ (đi tiếp luồng tải chứng từ + AI đọc).
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await addInboxToDossier(getContainer().mailbox, ctx, await parseBody(req, AddInboxToDossierInputSchema)));
});
