// Bộ quy tắc khai báo của doanh nghiệp (Markdown) – xuất từ bài học đang dùng.
import { exportTeachRules } from "@kb/core/modules/teaching";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { HttpError, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  const r = await exportTeachRules(getContainer().teach, ctx);
  if (!r.ok) throw new HttpError(r.error.code === "FORBIDDEN" ? 403 : 409, r.error.code, r.error.message ?? "Không xuất được");
  return new Response(r.value.markdown, {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${r.value.fileName}"`, "cache-control": "no-store" },
  });
});
