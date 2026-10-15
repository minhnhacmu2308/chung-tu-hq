import { HsAnswerInputSchema } from "@kb/contracts";
import { answerHsQuestion } from "@kb/core/modules/declaration";
import { getContainer } from "@/container";
import { requireSession } from "@/lib/server/auth";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Người khai trả lời câu hỏi của AI phân loại HS; gửi tới HSCodePro qua job hs-answer. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, HsAnswerInputSchema);
  return fromResult(await answerHsQuestion(getContainer().declaration, ctx, params.id!, input));
});
