import { UpdateMailFiltersInputSchema } from "@kb/contracts";
import { disconnectMailbox, updateMailFilters } from "@kb/core/modules/mailbox";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

// Gỡ kết nối hộp thư (email đã lấy vẫn ở hộp thư chứng từ).
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await disconnectMailbox(getContainer().mailbox, ctx, params.id!));
});

// Lưu bộ lọc của hộp thư (người gửi, từ khóa, loại file); rescan → lần lấy tới quét lại 30 ngày.
export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, UpdateMailFiltersInputSchema);
  return fromResult(await updateMailFilters(getContainer().mailbox, ctx, params.id!, input));
});
