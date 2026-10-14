import { LabelSampleInputSchema } from "@kb/contracts";
import { getSampleLabel, labelSample } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Mẫu kèm nhãn hiện có (nháp AI đọc hoặc đã sửa). */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getSampleLabel(getContainer().skill, ctx, params.sampleId!));
});

/** Người duyệt ghi giá trị đúng cho mẫu (theo key trường skill). */
export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { expected } = await parseBody(req, LabelSampleInputSchema);
  return fromResult(await labelSample(getContainer().skill, ctx, params.sampleId!, expected));
});
