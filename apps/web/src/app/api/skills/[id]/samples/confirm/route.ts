import { confirmPendingSamples } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Xác nhận các mẫu chờ đã có nhãn nháp → đã gắn nhãn. Trả { confirmed }. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return { confirmed: fromResult(await confirmPendingSamples(getContainer().skill, ctx, params.id!)) };
});
