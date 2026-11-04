import { DraftDossierInputSchema } from "@kb/contracts";
import { draftDossierWithAi } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** "Nhờ AI điền" form Tạo hồ sơ (ADR 0010) – trả giá trị gợi ý, không tạo hồ sơ. */
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await draftDossierWithAi(getContainer().dossier, ctx, await parseBody(req, DraftDossierInputSchema)));
});
