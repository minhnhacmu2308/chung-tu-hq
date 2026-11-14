// Đổi bộ nguồn gốc (spec 2026-11-14 §3) – Quản trị/Chủ hoặc người phụ trách bộ đích. Gọi lại sau khi bổ sung hệ số = "Áp dụng lại" (idempotent).
import { ChangeSourceInputSchema } from "@kb/contracts";
import { changeSourceSet } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await changeSourceSet(getContainer().catalog, ctx, await parseBody(req, ChangeSourceInputSchema)));
});
