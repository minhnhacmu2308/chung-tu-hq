import { SendHysInputSchema } from "@kb/contracts";
import { sendHysSubmission } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Ký số và gửi bộ HYS: outbox `hys:<id>:n<attempt>` + job customs-send. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, SendHysInputSchema);
  return fromResult(await sendHysSubmission(getContainer().customs, ctx, params.id!, params.hysId!, input));
});
