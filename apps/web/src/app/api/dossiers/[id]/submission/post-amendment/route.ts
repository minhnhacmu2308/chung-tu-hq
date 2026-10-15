import { startPostAmendment } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Bắt đầu sửa đổi sau thông quan: tờ khai đã thông quan → mở lại (DRAFT, bước Review) để khai AMA. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  fromResult(await startPostAmendment(getContainer().customs, ctx, params.id!));
  return { ok: true };
});
