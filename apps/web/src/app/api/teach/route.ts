// Dạy khai báo: tổng quan (cài đặt, tờ khai mẫu, bài học, độ chính xác theo tháng).
import { getTeachOverview } from "@kb/core/modules/teaching";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await getTeachOverview(getContainer().teach, ctx));
});
