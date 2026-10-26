// HYS (mock): gợi ý còn thiếu của tờ khai hồ sơ – cùng luật suggestHys/satisfiedHysCodes với backend (hys-submissions.ts).
import { attachmentPairs, declarationFormValues, satisfiedHysCodes, suggestHys, type AttachmentPair, type AttachmentValues, type HysSubmissionView, type HysSuggestion } from "@kb/contracts";
import type { MockDb } from "@/mocks/db";

export type MockHys = HysSubmissionView & { dossierId: string };

const firstToken = (v: string): string => v.split(/\s*[–-]\s*/)[0]!.trim();

export const kindOfDossier = (direction: "NK" | "XK"): "IDA" | "EDA" => (direction === "NK" ? "IDA" : "EDA");

/** Giá trị ô form của tờ khai (TK_EA* chuẩn hóa về mã) – như hysValuesOf của backend. */
export function hysValues(db: MockDb, dossierId: string): { kind: "IDA" | "EDA"; values: Record<string, string> } | null {
  const dossier = db.dossiers.find((d) => d.id === dossierId);
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  if (!dossier || !decl) return null;
  const kind = kindOfDossier(dossier.direction);
  const values: Record<string, string> = declarationFormValues(kind, decl.fields);
  for (const n of [1, 2, 3]) if (values[`TK_EA${n}`]) values[`TK_EA${n}`] = firstToken(values[`TK_EA${n}`]!);
  return { kind, values };
}

export function pendingSuggestions(db: MockDb, dossierId: string, containerCount: number): HysSuggestion[] {
  const v = hysValues(db, dossierId);
  if (!v) return [];
  const rows = (db.hys ?? []).filter((h) => h.dossierId === dossierId && h.procedureCode !== null);
  const satisfied = satisfiedHysCodes(v.values as AttachmentValues, rows.map((h) => ({ procedureCode: h.procedureCode!, status: h.status, fill: h.fill })));
  return suggestHys({ kind: v.kind, values: v.values, containerCount, satisfied });
}

/** Các cặp 1.63/2.53 đang có số của tờ khai hồ sơ – như attachmentSlots của getHysOverview backend. */
export function attachmentSlotsOf(db: MockDb, dossierId: string): AttachmentPair[] {
  const v = hysValues(db, dossierId);
  return v ? attachmentPairs(v.values as AttachmentValues) : [];
}
