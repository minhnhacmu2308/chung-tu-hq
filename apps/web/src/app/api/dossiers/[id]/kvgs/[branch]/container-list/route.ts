import { SaveContainerListInputSchema } from "@kb/contracts";
import { getKvgs, saveContainerList } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";
import { branchOf } from "../branch";

/** Xem danh sách container (cùng dữ liệu màn KVGS; có thể tạo bản DRAFT lần đầu). */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getKvgs(getContainer().customs, ctx, params.id!, branchOf(params)));
});

/** Lưu nháp bảng container (field_audit từng ô đổi; ACCEPTED → lần khai mới). */
export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const branch = branchOf(params);
  const input = await parseBody(req, SaveContainerListInputSchema);
  return fromResult(await saveContainerList(getContainer().customs, ctx, params.id!, branch, input));
});
