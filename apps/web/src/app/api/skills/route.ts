import { CreateSkillInputSchema, SkillListQuerySchema } from "@kb/contracts";
import { createSkill, listSkills } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** ?kind=DOCUMENT|SUPPLIER|MAPPING */
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const q = SkillListQuerySchema.parse({ kind: req.nextUrl.searchParams.get("kind") ?? undefined });
  return fromResult(await listSkills(getContainer().skill, ctx, q.kind));
});

/** Doanh nghiệp tự tạo skill (OWNER/ADMIN). Trùng mã → 409. */
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, CreateSkillInputSchema);
  return fromResult(await createSkill(getContainer().skill, ctx, input));
});
