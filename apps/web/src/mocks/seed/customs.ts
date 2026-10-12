// Dữ liệu mẫu bước 6 (truyền Hải quan) cho các hồ sơ đã truyền.
// dos_024 (ARTEMIDE) đã duyệt nhưng CHƯA truyền → PM tự bấm "Truyền tờ khai".
import { buildSubmission } from "../customs-sim";
import type { CustomsMessage, CustomsResult, Dossier } from "../types";
import { seedCore } from "./core";
import { seedDeclaration } from "./declaration";

const MIN = 60_000;

export function seedCustoms(dossiers: Dossier[]): { customsMessages: CustomsMessage[]; customsResults: CustomsResult[] } {
  const { declarations } = seedDeclaration(dossiers);
  const taxCode = seedCore().org.taxCode;
  const customsMessages: CustomsMessage[] = [];
  const customsResults: CustomsResult[] = [];

  for (const d of dossiers) {
    if (d.status !== "SUBMITTED" && d.status !== "CLEARED") continue;
    const decl = declarations.find((x) => x.dossierId === d.id);
    if (!decl || !d.channel) continue;
    const start = new Date(d.updatedAt).getTime() - 40 * MIN;
    const { messages, result } = buildSubmission(d, decl, taxCode, start, 4 * MIN, {
      channel: d.channel,
      hysRetry: d.id === "dos_019",
      clearedAfterInspection: d.status === "CLEARED",
      documentCount: 3,
    });
    customsMessages.push(...messages);
    customsResults.push(result);
  }
  return { customsMessages, customsResults };
}
