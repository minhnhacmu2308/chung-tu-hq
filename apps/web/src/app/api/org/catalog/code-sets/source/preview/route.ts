// Xem trước đổi bộ nguồn gốc: số mặt hàng sẽ đổi gốc / giữ nguyên / không có mã ở bộ mới + danh sách thiếu hệ số. Không ghi gì.
import { SourcePreviewQuerySchema } from "@kb/contracts";
import { previewSourceChange } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseQuery, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const { codeSetId } = parseQuery(req, SourcePreviewQuerySchema);
  return fromResult(await previewSourceChange(getContainer().catalog, ctx, codeSetId));
});
