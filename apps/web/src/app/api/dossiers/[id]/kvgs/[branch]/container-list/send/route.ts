import { sendContainerList } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";
import { branchOf } from "../../branch";

/** Khai danh sách container: outbox cont:<listId>:a<attempt> + job customs-send; đang SENDING → KVGS_ALREADY_SENDING. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await sendContainerList(getContainer().customs, ctx, params.id!, branchOf(params)));
});
