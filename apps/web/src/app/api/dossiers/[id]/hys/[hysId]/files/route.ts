import { addHysUploadedFiles } from "@kb/core/modules/integration";
import { readUploadFiles } from "@/lib/server/upload";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** multipart/form-data, trường `files` (nhiều): file tải lên riêng cho bộ HYS. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const files = await readUploadFiles(req);
  return fromResult(await addHysUploadedFiles(getContainer().customs, ctx, params.id!, params.hysId!, files));
});
