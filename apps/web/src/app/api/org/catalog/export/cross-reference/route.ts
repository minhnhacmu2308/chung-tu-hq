// Bảng đối chiếu mã: mỗi dòng một mã nối + mã ở mọi bộ, tên, HS, ĐVT gốc, hệ số (mọi vai trò được xuất; trình duyệt dựng file Excel).
import { exportCrossReference } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await exportCrossReference(getContainer().catalog, ctx));
});
