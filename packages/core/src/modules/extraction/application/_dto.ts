import type { ExtractedField } from "@kb/contracts";
import type { FieldRow } from "./ports.js";

export const toField = (r: FieldRow): ExtractedField => ({
  id: r.id, documentId: r.documentId, group: r.group, key: r.key, label: r.label, value: r.value, originalValue: r.originalValue, status: r.status,
  ...(r.region ? { region: r.region } : {}),
  ...(r.note ? { note: r.note } : {}),
});
