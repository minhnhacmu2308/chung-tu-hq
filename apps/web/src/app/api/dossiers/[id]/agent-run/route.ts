import { StartAgentRunInputSchema } from "@kb/contracts";
import { getAgentRun, startAgentRun } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Tiến trình agent gần nhất; chưa chạy → { run: null }. */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return { run: fromResult(await getAgentRun(getContainer().declaration, ctx, params.id!)) };
});
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { mode } = await parseBody(req, StartAgentRunInputSchema);
  return fromResult(await startAgentRun(getContainer().declaration, ctx, params.id!, mode));
});
