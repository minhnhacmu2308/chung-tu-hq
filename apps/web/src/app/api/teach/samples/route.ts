import { uploadTeachSamples } from "@kb/core/modules/teaching";
import { readUploadFiles } from "@/lib/server/upload";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** multipart/form-data, trường `files` (nhiều): tờ khai đã thông quan (PDF scan/PDF/ảnh). AI đọc nền (job teach-sample-read). */
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const files = await readUploadFiles(req);
  return fromResult(await uploadTeachSamples(getContainer().teach, ctx, files));
});
