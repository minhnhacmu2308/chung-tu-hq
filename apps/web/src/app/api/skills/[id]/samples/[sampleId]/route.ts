import { LabelSampleInputSchema } from "@kb/contracts";
import { labelSample } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Người duyệt ghi giá trị đúng cho mẫu (theo key trường skill). */
export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { expected } = await parseBody(req, LabelSampleInputSchema);
  return fromResult(await labelSample(getContainer().skill, ctx, params.sampleId!, expected));
});
