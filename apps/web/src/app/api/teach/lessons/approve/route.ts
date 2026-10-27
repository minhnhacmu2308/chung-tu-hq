import { z } from "zod";
import { approveLessons } from "@kb/core/modules/teaching";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

const Body = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });
/** Duyệt nhiều bài học một lần → trả số bài học vừa chuyển sang đang dùng. */
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const { ids } = await parseBody(req, Body);
  return { approved: fromResult(await approveLessons(getContainer().teach, ctx, ids)) };
});
