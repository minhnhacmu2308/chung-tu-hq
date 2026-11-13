// Một lần nhập: trạng thái + tiến độ ghép (poll khi chạy nền) + số mới / tự ghép / chờ / bỏ qua / lỗi.
import { getImport } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getImport(getContainer().catalog, ctx, params.id!));
});
