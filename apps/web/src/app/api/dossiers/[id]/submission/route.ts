import { SubmitDeclarationInputSchema } from "@kb/contracts";
import { getSubmission, submitDeclaration } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getSubmission(getContainer().customs, ctx, params.id!));
});
/** Truyền tờ khai: outbox IDA/EDA + job customs-send (ADR 0005). */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { certificateId } = await parseBody(req, SubmitDeclarationInputSchema);
  return fromResult(await submitDeclaration(getContainer().customs, ctx, params.id!, certificateId));
});
