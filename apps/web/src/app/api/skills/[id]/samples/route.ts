import { listSamples, uploadSamples } from "@kb/core/modules/skill";
import { readUploadFiles } from "@/lib/server/upload";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await listSamples(getContainer().skill, ctx, params.id!));
});
/** multipart/form-data, trường `files` (nhiều). Mẫu ở trạng thái chờ gắn nhãn; AI đọc nền để có nhãn nháp. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const files = await readUploadFiles(req);
  return fromResult(await uploadSamples(getContainer().skill, ctx, params.id!, files));
});
