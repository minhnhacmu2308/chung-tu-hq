// "Lấy từ chứng từ đã đọc": dòng tờ khai đã duyệt → bộ XNK; dòng invoice/packing list có Part No → bộ nhà cung cấp/khách hàng theo đối tác.
import { ImportFromDocumentsInputSchema } from "@kb/contracts";
import { importFromDocuments } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await importFromDocuments(getContainer().catalog, ctx, await parseBody(req, ImportFromDocumentsInputSchema)));
});
