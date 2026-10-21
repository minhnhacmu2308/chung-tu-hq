// Câu giải thích nguồn gốc chỉ tiêu cho người duyệt (chỉ hiện khi khác quy tắc mặc định của hệ thống).
import type { FieldProvenance } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { PROVENANCE_MESSAGES } from "./provenance.messages";

const SOURCE_IDS = new Set(["an.warehouse", "transport.houseBillNo", "transport.masterBillNo", "transport.arrivalDate", "transport.departureDate"]);
type SourceId = "an.warehouse" | "transport.houseBillNo" | "transport.masterBillNo" | "transport.arrivalDate" | "transport.departureDate";

export function provenanceLabel(p: FieldProvenance | undefined, locale: UiLocale): string | null {
  if (!p || p.via === "default") return null;
  const t = pickMessages(PROVENANCE_MESSAGES, locale);
  if (p.via === "profile") return t.profile;
  if (p.via === "fixed") return t.fixed;
  const id = p.sourceId ?? "";
  const source = id.startsWith("profile.") ? t.profileSource : SOURCE_IDS.has(id) ? t[id as SourceId] : id;
  return fill(t.chosen, { source });
}
