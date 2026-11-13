// Nhập danh mục từ Excel vào một bộ mã: trình duyệt đọc file + ghép cột, gửi dòng thô; ≤ 500 dòng ghép ngay, > 500 dòng job nền `catalog-import`.
// Mỗi yêu cầu tối đa CATALOG_IMPORT_MAX_ROWS_PER_REQUEST dòng (thân < 10 MB của proxy Next) – vượt → 400 CATALOG_IMPORT_TOO_LARGE, giao diện chia file.
// GET: các lần nhập gần nhất (mới trước).
import { CATALOG_IMPORT_MAX_ROWS_PER_REQUEST, ImportRowsInputSchema, importRowsTooLarge, reasonVi } from "@kb/contracts";
import { importRows, listImports } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, HttpError, json, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await listImports(getContainer().catalog, ctx));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const body = await json(req);
  if (importRowsTooLarge(body)) {
    const params = { max: CATALOG_IMPORT_MAX_ROWS_PER_REQUEST };
    throw new HttpError(400, "VALIDATION", reasonVi("CATALOG_IMPORT_TOO_LARGE", params), "CATALOG_IMPORT_TOO_LARGE", params);
  }
  return fromResult(await importRows(getContainer().catalog, ctx, ImportRowsInputSchema.parse(body)));
});
