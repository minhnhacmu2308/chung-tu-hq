// Dữ liệu mẫu bước 6 (truyền Hải quan) cho các hồ sơ đã truyền.
// dos_024 (ARTEMIDE) đã duyệt nhưng CHƯA truyền → PM tự bấm "Ký số & khai tạm (IDA)".
// Hồ sơ đã thông quan → giai đoạn CLEARED (mở được sửa sau thông quan); đang kiểm tra (dos_019) → DECLARED (sửa đổi bổ sung được).
import { buildSubmission, type CustomsFlow } from "../customs-sim";
import type { CustomsMessage, CustomsResult, Dossier } from "../types";
import { seedCore } from "./core";
import { seedDeclaration } from "./declaration";

const MIN = 60_000;

export function seedCustoms(dossiers: Dossier[]): { customsMessages: CustomsMessage[]; customsResults: CustomsResult[]; customsFlows: Record<string, CustomsFlow> } {
  const { declarations } = seedDeclaration(dossiers);
  const taxCode = seedCore().org.taxCode;
  const customsMessages: CustomsMessage[] = [];
  const customsResults: CustomsResult[] = [];
  const customsFlows: Record<string, CustomsFlow> = {};

  for (const d of dossiers) {
    if (d.status !== "SUBMITTED" && d.status !== "CLEARED") continue;
    const decl = declarations.find((x) => x.dossierId === d.id);
    if (!decl || !d.channel) continue;
    const start = new Date(d.updatedAt).getTime() - 40 * MIN;
    const { messages, result, flow } = buildSubmission(d, decl, taxCode, start, 4 * MIN, {
      channel: d.channel,
      hysRetry: d.id === "dos_019",
      clearedAfterInspection: d.status === "CLEARED",
      documentCount: 3,
    });
    customsMessages.push(...messages);
    customsResults.push(result);
    customsFlows[d.id] = flow;
  }
  return { customsMessages, customsResults, customsFlows };
}
