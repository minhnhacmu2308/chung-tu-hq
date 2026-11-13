// Bộ mã của danh mục: danh sách (mọi vai trò), tạo (Quản trị/Chủ; chế độ SHARED chỉ tạo bộ nhà cung cấp/khách hàng).
import { UpsertCodeSetInputSchema } from "@kb/contracts";
import { listCodeSets, upsertCodeSet } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await listCodeSets(getContainer().catalog, ctx));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await upsertCodeSet(getContainer().catalog, ctx, await parseBody(req, UpsertCodeSetInputSchema)));
});
