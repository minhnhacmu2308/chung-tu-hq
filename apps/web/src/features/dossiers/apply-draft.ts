// Điền nhanh form Tạo hồ sơ: từ gợi ý của "Nhờ AI điền" hoặc sao chép một hồ sơ cũ (ADR 0010). Chỉ thông tin form – không chứng từ, không tờ khai.
import type { Direction, Dossier, DossierDraft, TransportMode } from "@kb/contracts";

/** Các ô của form Tạo hồ sơ mà điền nhanh có thể đặt. */
export type QuickFillForm = {
  direction: Direction;
  typeCode: string | null;
  partner: string;
  customsOffice: string | null;
  transportMode: TransportMode;
  typeGroup: unknown;
  dueDate: string | null;
  skillSetId: string;
  note: string;
};
export type QuickFillField = "direction" | "transportMode" | "typeCode" | "customsOffice" | "partner" | "dueDate" | "skillSetId" | "note";

/** Sao chép hồ sơ cũ không cần AI: chiều, vận tải, loại hình, chi cục (mã), đối tác, bộ skill, ghi chú. Hạn xử lý giữ như form. */
export function draftFromDossier(d: Dossier): DossierDraft {
  const office = d.customsOffice.split(/\s+[–-]\s+/)[0]?.trim();
  return {
    direction: d.direction, transportMode: d.transportMode, typeCode: d.typeCode, partner: d.partner, skillSetId: d.skillSetId,
    ...(office ? { customsOfficeCode: office } : {}),
    ...(d.note ? { note: d.note } : {}),
    fromDossier: { id: d.id, code: d.code },
  };
}

/**
 * Ghi gợi ý vào form; ô gợi ý không có giữ nguyên. Đổi chiều mà gợi ý không kèm loại hình → loại hình mặc định của chiều mới (A11/B11, như đổi chiều tay).
 * Trả về các ô đã điền để đánh dấu "không bị Mặc định khai báo ghi đè" và báo cho người dùng.
 */
export function applyDraft<F extends QuickFillForm>(form: F, d: DossierDraft): { form: F; filled: QuickFillField[] } {
  const next: F = { ...form };
  const filled: QuickFillField[] = [];
  const put = <K extends QuickFillField>(k: K, v: F[K] | undefined) => {
    if (v === undefined) return;
    next[k] = v;
    filled.push(k);
  };
  put("direction", d.direction as F["direction"] | undefined);
  put("transportMode", d.transportMode as F["transportMode"] | undefined);
  put("typeCode", d.typeCode as F["typeCode"] | undefined);
  put("customsOffice", d.customsOfficeCode as F["customsOffice"] | undefined);
  put("partner", d.partner as F["partner"] | undefined);
  put("dueDate", d.dueDate as F["dueDate"] | undefined);
  put("skillSetId", d.skillSetId as F["skillSetId"] | undefined);
  put("note", d.note as F["note"] | undefined);
  if (d.direction && d.direction !== form.direction && !d.typeCode) next.typeCode = d.direction === "NK" ? "A11" : "B11";
  if (d.typeCode || d.direction) next.typeGroup = null;
  return { form: next, filled };
}
