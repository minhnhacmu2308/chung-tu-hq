import { SuggestAliasInputSchema } from "@kb/contracts";
import { fieldSource } from "@kb/core/modules/extraction";
import { listSuggestions, suggestAlias } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const skillId = new URL(req.url).searchParams.get("skillId") ?? undefined;
  return fromResult(await listSuggestions(getContainer().skill, ctx, skillId || undefined));
});

/** Nhãn in cạnh giá trị người dùng chỉ/sửa trên file gốc → gợi ý thêm nhãn cho trường của skill (chưa áp). */
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, SuggestAliasInputSchema);
  const c = getContainer();
  const src = fromResult(await fieldSource(c.extraction, ctx, input.fieldId));
  if (!src) return { suggestion: null };
  return { suggestion: fromResult(await suggestAlias(c.skill, ctx, src, input.label)) };
});
