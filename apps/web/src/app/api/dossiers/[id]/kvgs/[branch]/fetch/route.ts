import { requestKvgsFetch } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";
import { branchOf } from "../branch";

/** Lấy danh sách qua KVGS: outbox kvgs:<id> + job customs-send; chỉ sau thông quan (và NK container đã được chấp nhận danh sách). */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await requestKvgsFetch(getContainer().customs, ctx, params.id!, branchOf(params)));
});
