import { getPostAmendmentView } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Bản khai bổ sung sau thông quan (AMA): bản đang mở, các bản đã khai chính thức, dòng tờ khai gốc chọn được, hợp đồng gia công. */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getPostAmendmentView(getContainer().customs, ctx, params.id!));
});
