// Xuất bảng đọc chứng từ của hồ sơ ra Excel (mỗi chứng từ một sheet: STT | TÊN TRƯỜNG | TRỊ GIÁ).
import { documentSheets } from "@kb/core/modules/extraction";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { buildDocumentSheetsWorkbook } from "@/lib/document-sheets-xlsx";
import { HttpError, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  const r = await documentSheets(getContainer().extraction, ctx, params.id!);
  if (!r.ok) throw new HttpError(404, r.error.code, r.error.message ?? "Không xuất được");
  if (!r.value.length) throw new HttpError(404, "NOT_READY", "Chưa có chứng từ đọc xong để xuất");
  const body = await buildDocumentSheetsWorkbook(r.value);
  return new Response(body, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="bang-doc-chung-tu-${params.id}.xlsx"`,
      "cache-control": "no-store",
    },
  });
});
