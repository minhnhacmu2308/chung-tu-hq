import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { HttpError, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/**
 * Chuyển hướng tới presigned URL (10 phút) của file chứng từ; `?json=1` trả JSON {url, expiresAt}.
 * File không còn trong kho → 404 FILE_MISSING (không đưa link chết cho trình duyệt – nó sẽ hiện trang lỗi XML của kho).
 */
export const GET = route(async (req, params) => {
  const { ctx } = await requireSession();
  const c = getContainer();
  const doc = await c.dossier.uow.asOrg(ctx, (r) => r.documents.get(ctx.orgId, params.id!));
  if (!doc) throw new HttpError(404, "NOT_FOUND", "Không tìm thấy chứng từ");
  if (!(await c.dossier.storage.exists(doc.storageKey))) throw new HttpError(404, "FILE_MISSING", "File gốc không còn trong kho lưu trữ");
  const ttl = 600;
  const url = await c.dossier.storage.presignGet(doc.storageKey, ttl);
  if (req.nextUrl.searchParams.get("json")) return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  return NextResponse.redirect(url, 302);
});
