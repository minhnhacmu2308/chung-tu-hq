import { getKvgs } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";
import { branchOf } from "./branch";

/** Màn Qua khu vực giám sát của tờ `branch`: trạng thái 2 khối + bảng kê mới nhất. Lần đầu NK container có thể tạo bản DRAFT điền sẵn (GET có ghi, người có quyền sửa). */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getKvgs(getContainer().customs, ctx, params.id!, branchOf(params)));
});
