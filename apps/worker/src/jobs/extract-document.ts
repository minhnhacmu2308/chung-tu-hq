import { processDocument, type ExtractionDeps } from "@kb/core/modules/extraction";
import { createLogger } from "@kb/core/shared";
import { z } from "zod";
import { parsePayload } from "./_payload.js";

const log = createLogger({ name: "worker" });

export const ExtractDocumentPayload = z.object({ orgId: z.string().min(1), dossierId: z.string().min(1), documentId: z.string().min(1), mode: z.enum(["FULL", "MERGE_ONLY"]).default("FULL"), idempotencyKey: z.string() });

/** Handler MỎNG: parse payload → use case. Lỗi tạm ném ra để BullMQ retry; lỗi dữ liệu use case tự ghi ERROR. */
export async function extractDocumentJob(deps: ExtractionDeps, raw: unknown) {
  const p = parsePayload(ExtractDocumentPayload, raw, "extract-document");
  const r = await processDocument(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "extract-document", documentId: p.documentId, dossierId: p.dossierId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? "ok" : r.error.code;
}
