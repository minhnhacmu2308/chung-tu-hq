// "Nhờ AI điền" form Tạo hồ sơ (ADR 0010): AI chỉ hiểu câu yêu cầu → ô thô; code kiểm từng ô với danh mục VNACCS rồi ghép với hồ sơ gốc.
import { addIsoDays, DirectionSchema, TransportModeSchema, type CodeListEntry, type Direction, type DossierDraft } from "@kb/contracts";

/** Phần hồ sơ cũ được sao chép (chỉ thông tin form – không chứng từ, không tờ khai). */
export type DraftBase = { id: string; code: string; direction: Direction; transportMode: string; typeCode: string; customsOfficeCode: string; partner: string; skillSetId: string; note: string | null };

/** Ô AI trả về (chưa tin): chuỗi tự do, null = yêu cầu không nói tới. */
export type AiDossierDraft = {
  baseDossierCode: string | null;
  direction: string | null;
  transportMode: string | null;
  typeCode: string | null;
  customsOffice: string | null;
  partner: string | null;
  dueInDays: number | null;
  note: string | null;
};

const DOSSIER_CODE = /\bHS-(?:NK|XK)-\d{4}-\d{3,}\b/gi;

/** Mã hồ sơ người dùng gõ thẳng trong yêu cầu (không cần AI nhận ra). */
export const dossierCodesIn = (text: string): string[] => [...new Set((text.match(DOSSIER_CODE) ?? []).map((c) => c.toUpperCase()))];

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Chi cục từ "mã" hoặc "mã – tên" hoặc một phần tên; nhiều chi cục khớp tên → không đoán. */
export function resolveOffice(text: string | null, offices: readonly CodeListEntry[]): string | undefined {
  if (!text?.trim()) return undefined;
  const active = offices.filter((e) => !e.inactive);
  const head = /^\s*([A-Z0-9]{2,6})\s*(?:[–—-]|$)/i.exec(text)?.[1]?.toUpperCase();
  if (head) {
    const byCode = active.find((e) => e.code === head);
    if (byCode) return byCode.code;
  }
  const q = fold(text);
  if (q.length < 3) return undefined;
  const hits = active.filter((e) => fold(e.name).includes(q));
  return hits.length === 1 ? hits[0]!.code : undefined;
}

const clip = (s: string | null | undefined, max: number) => {
  const v = s?.trim();
  return v ? v.slice(0, max) : undefined;
};

/**
 * Gợi ý cuối cùng: lấy hồ sơ gốc (nếu có) rồi ghi đè bằng ô AI hợp lệ. Ô AI sai danh mục bị bỏ (giữ của hồ sơ gốc).
 * Loại hình không thuộc chiều cuối cùng → bỏ (người dùng chọn lại). Hạn xử lý chỉ đặt khi yêu cầu nói (0–90 ngày).
 */
export function buildDossierDraft(
  ai: AiDossierDraft,
  base: DraftBase | null,
  lists: { typeCodes: readonly CodeListEntry[]; offices: readonly CodeListEntry[] },
  today: string,
): DossierDraft {
  const direction: Direction | undefined = DirectionSchema.safeParse(ai.direction?.toUpperCase()).data ?? base?.direction;
  const transportMode = TransportModeSchema.safeParse(ai.transportMode?.toUpperCase()).data ?? TransportModeSchema.safeParse(base?.transportMode).data;
  const validType = (code: string | null | undefined) => {
    const c = code?.trim().toUpperCase();
    return c && direction && lists.typeCodes.some((e) => e.code === c && e.parent === direction && !e.inactive) ? c : undefined;
  };
  const typeCode = validType(ai.typeCode) ?? validType(base?.typeCode);
  const customsOfficeCode = resolveOffice(ai.customsOffice, lists.offices) ?? resolveOffice(base?.customsOfficeCode ?? null, lists.offices);
  const partner = clip(ai.partner, 200) ?? clip(base?.partner, 200);
  const note = clip(ai.note, 500) ?? clip(base?.note, 500);
  const days = ai.dueInDays;
  const dueDate = days !== null && Number.isInteger(days) && days >= 0 && days <= 90 ? addIsoDays(today, days) : undefined;
  return {
    ...(direction ? { direction } : {}),
    ...(transportMode ? { transportMode } : {}),
    ...(typeCode ? { typeCode } : {}),
    ...(customsOfficeCode ? { customsOfficeCode } : {}),
    ...(partner ? { partner } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(base?.skillSetId ? { skillSetId: base.skillSetId } : {}),
    ...(note ? { note } : {}),
    ...(base ? { fromDossier: { id: base.id, code: base.code } } : {}),
  };
}
