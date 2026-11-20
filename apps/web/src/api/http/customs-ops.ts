// Nghiệp vụ khác – số định danh theo lô, gọi backend thật. Cùng chữ ký với src/mocks/api/customs-ops.ts.
import { IdentifierListSchema, type IdentifierBatchRequest, type IdentifierListQuery } from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPost } from "@/lib/http";

const base = "customs/identifiers";
const BatchSchema = z.object({ batchId: z.string(), ids: z.array(z.string()) });

export function listIdentifiers(q: Partial<IdentifierListQuery>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") sp.set(k, String(v));
  return apiGet(`${base}?${sp}`, IdentifierListSchema);
}
export const requestIdentifierBatch = (input: IdentifierBatchRequest) => apiPost(base, input, BatchSchema);
export const deleteIdentifiers = (ids: string[]) => apiPost(`${base}/delete`, { ids }, z.object({ deleted: z.array(z.string()) }));
export const retryIdentifier = (id: string) => apiPost<void>(`${base}/${encodeURIComponent(id)}/retry`, {});
export const pollIdentifierRow = (id: string) => apiPost<void>(`${base}/${encodeURIComponent(id)}/poll`, {});
export const takeIdentifier = (id: string, dossierId: string) => apiPost(`${base}/${encodeURIComponent(id)}/use`, { dossierId }, z.object({ identifierNo: z.string() }));
export const releaseIdentifier = (id: string, dossierId: string) => apiDelete<void>(`${base}/${encodeURIComponent(id)}/use?dossierId=${encodeURIComponent(dossierId)}`);
