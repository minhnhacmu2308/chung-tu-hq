import { recallAllSheets } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Gọi về tất cả tờ còn hiệu lực ở Hải quan: IDB/IDD (EDB/EDD) tờ đầu, worker nối tiếp các tờ sau; lệnh cuối xong → tự mở lại tờ khai (không body). */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await recallAllSheets(getContainer().customs, ctx, params.id!));
});
