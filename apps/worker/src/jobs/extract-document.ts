import { processDocument, type ExtractionDeps } from "@kb/core/modules/extraction";
import { z } from "zod";

export const ExtractDocumentPayload = z.object({ orgId: z.string().min(1), dossierId: z.string().min(1), documentId: z.string().min(1), mode: z.enum(["FULL", "MERGE_ONLY"]).default("FULL"), idempotencyKey: z.string() });

/** Handler MỎNG: parse payload → use case. Lỗi tạm ném ra để BullMQ retry; lỗi dữ liệu use case tự ghi ERROR. */
export async function extractDocumentJob(deps: ExtractionDeps, raw: unknown) {
  const p = ExtractDocumentPayload.parse(raw);
  const r = await processDocument(deps, p);
  if (!r.ok) console.warn(`[extract-document] ${p.documentId}: ${r.error.code} ${r.error.message ?? ""}`);
  return r.ok ? "ok" : r.error.code;
}
