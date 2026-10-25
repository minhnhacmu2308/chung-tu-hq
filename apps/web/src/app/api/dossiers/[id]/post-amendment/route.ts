import { BranchQuerySchema } from "@kb/contracts";
import { getPostAmendmentView } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseQuery, route } from "@/lib/server/route";

/** Bản khai bổ sung sau thông quan (AMA) của tờ `?branch=` (mặc định 1): bản đang mở, các bản đã khai chính thức, dòng tờ khai gốc chọn được, hợp đồng gia công. */
export const GET = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { branch } = parseQuery(req, BranchQuerySchema);
  return fromResult(await getPostAmendmentView(getContainer().customs, ctx, params.id!, branch));
});
