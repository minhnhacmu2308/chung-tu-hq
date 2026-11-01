// "Nhờ AI điền" form Tạo hồ sơ (ADR 0010): model rẻ hiểu câu yêu cầu, code kiểm danh mục + ghép hồ sơ cũ. Không tạo hồ sơ – người dùng xem rồi bấm Tạo.
import { loadCodeList, vnDateOf, type DossierDraft, type DraftDossierInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { buildDossierDraft, dossierCodesIn, type AiDossierDraft, type DraftBase } from "../domain/draft.js";
import type { DossierBrief, DossierDeps, DossierRow } from "./ports.js";

/** Số hồ sơ gần đây gửi kèm cho AI (đủ để nhận "giống lô HANSOL lần trước", prompt vẫn nhỏ). */
const RECENT = 30;
/** Lần nhờ AI điền / người / giờ. */
export const DOSSIER_AI_PER_HOUR = 30;

const brief = (d: DossierRow): DossierBrief => ({
  code: d.code, direction: d.direction, transportMode: d.transportMode, typeCode: d.typeCode,
  customsOffice: d.customsOfficeName ? `${d.customsOfficeCode} – ${d.customsOfficeName}` : d.customsOfficeCode, partner: d.partner, createdOn: d.createdAt.toISOString().slice(0, 10),
});
const toBase = (d: DossierRow): DraftBase => ({
  id: d.id, code: d.code, direction: d.direction, transportMode: d.transportMode, typeCode: d.typeCode, customsOfficeCode: d.customsOfficeCode, partner: d.partner, skillSetId: d.skillSetId, note: d.note,
});

export async function draftDossierWithAi(deps: DossierDeps, ctx: Ctx, input: DraftDossierInput): Promise<Result<DossierDraft>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  if (!deps.draftAi) return err(reasonError("INTEGRATION_NOT_CONFIGURED", "DOSSIER_AI_NOT_CONFIGURED"));
  if (deps.limiter && !(await deps.limiter.hit(`dossier-ai:${ctx.userId}`, DOSSIER_AI_PER_HOUR, 3600)).allowed) return err(reasonError("RATE_LIMITED", "DOSSIER_AI_RATE_LIMITED"));
  // Mã hồ sơ gõ thẳng trong yêu cầu có thể cũ hơn 30 hồ sơ gần đây → tìm riêng (cùng transaction đọc, không gọi ra ngoài).
  const typed = dossierCodesIn(input.prompt);
  const { recent, named } = await deps.uow.asOrg(ctx, async (r) => ({
    recent: await r.dossiers.list(ctx.orgId, {}, { limit: RECENT, offset: 0 }),
    named: (await Promise.all(typed.slice(0, 3).map((code) => r.dossiers.list(ctx.orgId, { q: code }, { limit: 5, offset: 0 })))).flat(),
  }));
  const today = vnDateOf(deps.clock.now());
  let res: Awaited<ReturnType<NonNullable<DossierDeps["draftAi"]>["draft"]>>;
  try {
    res = await deps.draftAi.draft({ prompt: input.prompt, today, recent: recent.map(brief) });
  } catch {
    return err(reasonError("GATEWAY_ERROR", "DOSSIER_AI_FAILED"));
  }
  await deps.recordAiUsage?.({ orgId: ctx.orgId, kind: "AI_DOSSIER_DRAFT", ...res.usage });
  if (!res.result) return err(reasonError("GATEWAY_ERROR", "DOSSIER_AI_FAILED"));
  const ai: AiDossierDraft = res.result;
  const byCode = new Map([...recent, ...named].map((d) => [d.code.toUpperCase(), d]));
  const baseCode = typed.find((c) => byCode.has(c)) ?? ai.baseDossierCode?.trim().toUpperCase();
  const base = baseCode ? byCode.get(baseCode) : undefined;
  const [typeCodes, offices] = await Promise.all([loadCodeList("TYPE_CODE"), loadCodeList("A038")]);
  return ok(buildDossierDraft(ai, base ? toBase(base) : null, { typeCodes, offices }, today));
}
