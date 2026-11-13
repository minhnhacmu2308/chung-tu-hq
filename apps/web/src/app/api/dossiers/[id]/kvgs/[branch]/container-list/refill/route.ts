import { refillContainerList } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";
import { branchOf } from "../../branch";

/** Điền lại bảng container từ chứng từ đã đọc (cùng quy tắc khóa và audit như lưu). */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await refillContainerList(getContainer().customs, ctx, params.id!, branchOf(params)));
});
