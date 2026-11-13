// Sửa bộ mã: tên, đối tác, người phụ trách, mã hiển thị chính, bộ mặc định cho Hải quan (Quản trị/Chủ; loại bộ không đổi).
import { UpsertCodeSetInputSchema } from "@kb/contracts";
import { upsertCodeSet } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, UpsertCodeSetInputSchema);
  return fromResult(await upsertCodeSet(getContainer().catalog, ctx, { ...input, id: params.id! }));
});
