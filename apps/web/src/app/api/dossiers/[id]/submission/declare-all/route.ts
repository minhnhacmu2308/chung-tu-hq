import { declareAllSheets } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Khai chính thức cả lô nhiều tờ: IDC/IDE tờ đầu chờ khai chính thức, worker nối tiếp các tờ sau (không body). */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await declareAllSheets(getContainer().customs, ctx, params.id!));
});
