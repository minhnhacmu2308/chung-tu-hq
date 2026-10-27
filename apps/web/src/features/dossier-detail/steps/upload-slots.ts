// Bước 2 – chia chứng từ của hồ sơ thành từng ô theo loại. Logic thuần (có test), màn hình chỉ vẽ.
import { INCOTERMS_FREIGHT_NOT_INCLUDED } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { DOC_KIND_LABELS, type DocKind, type Dossier, type DossierDocument } from "@/mocks/types";
import { UPLOAD_SLOT_MESSAGES } from "./upload-slots.messages";

/** required = cần có cho bộ hồ sơ này; optional = tùy lô; extra = loại người dùng thêm/đã có; other = Khác hoặc máy chưa nhận ra loại. */
export type SlotNeed = "required" | "optional" | "extra" | "other";
export type DocSlot = { kind: DocKind; need: SlotNeed; reason?: string; docs: DossierDocument[] };

type Suggestion = { kind: DocKind; reason: string; optional?: boolean };

/** Chứng từ nên có theo hồ sơ. `reason` (theo `locale`) cho biết chứng từ dùng để làm gì. */
export function suggestedKinds(d: Pick<Dossier, "transportMode" | "incoterm" | "direction">, locale: UiLocale = "vi"): Suggestion[] {
  const t = pickMessages(UPLOAD_SLOT_MESSAGES, locale);
  const list: Suggestion[] = [
    { kind: "INVOICE", reason: t.invoice },
    { kind: "PACKING_LIST", reason: t.packingList, optional: true },
    d.transportMode === "AIR"
      ? { kind: "AIR_WAYBILL", reason: t.airWaybill }
      : { kind: "BILL_OF_LADING", reason: t.billOfLading },
  ];
  if (INCOTERMS_FREIGHT_NOT_INCLUDED.includes(d.incoterm)) {
    list.push({ kind: "FREIGHT_INVOICE", reason: fill(t.freightByIncoterm, { incoterm: d.incoterm }) });
  } else if (!d.incoterm && d.direction === "NK") {
    // Hồ sơ không khai điều kiện giao hàng (lấy từ invoice khi đọc): gợi ý tùy lô; thiếu cước thì luật đối chiếu ở bước OCR báo lỗi chặn.
    list.push({ kind: "FREIGHT_INVOICE", reason: t.freightMaybe, optional: true });
  }
  if (d.direction === "NK") list.push({ kind: "CERT_OF_ORIGIN", reason: t.certOfOrigin, optional: true });
  return list;
}

const KIND_ORDER = Object.keys(DOC_KIND_LABELS.vi) as DocKind[];
const BILL_KINDS: DocKind[] = ["BILL_OF_LADING", "AIR_WAYBILL"];

/**
 * Ô theo thứ tự: chứng từ gợi ý → loại đã có/người dùng thêm (theo thứ tự loại) → "Khác / chưa nhận ra loại" (khi có file).
 * Vận đơn đường biển và đường hàng không thay được cho nhau: đã upload loại kia thì ô gợi ý đổi theo.
 */
export function buildSlots(suggestions: readonly Suggestion[], docs: readonly DossierDocument[], addedKinds: readonly DocKind[] = []): DocSlot[] {
  const byKind = (k: DocKind) => docs.filter((d) => d.kind === k);
  const slots: DocSlot[] = suggestions.map((s) => {
    let kind = s.kind;
    if (BILL_KINDS.includes(kind) && byKind(kind).length === 0) kind = BILL_KINDS.find((b) => byKind(b).length > 0) ?? kind;
    return { kind, need: s.optional ? "optional" : "required", reason: s.reason, docs: byKind(kind) };
  });
  const shown = new Set(slots.map((s) => s.kind));
  for (const k of KIND_ORDER) {
    if (k === "OTHER" || shown.has(k)) continue;
    if (byKind(k).length > 0 || addedKinds.includes(k)) slots.push({ kind: k, need: "extra", docs: byKind(k) });
  }
  const other = byKind("OTHER");
  if (other.length > 0 || addedKinds.includes("OTHER")) slots.push({ kind: "OTHER", need: "other", docs: other });
  return slots;
}

/** Loại còn thêm được ô (chưa hiện). */
export function addableKinds(slots: readonly DocSlot[]): DocKind[] {
  const shown = new Set(slots.map((s) => s.kind));
  return KIND_ORDER.filter((k) => !shown.has(k));
}

/** Ô "cần có" mà chưa có file nào. */
export const missingRequired = (slots: readonly DocSlot[]) => slots.filter((s) => s.need === "required" && s.docs.length === 0);
