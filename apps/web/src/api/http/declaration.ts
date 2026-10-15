// Bước 4–5: AI Agent, dòng hàng/HS, tờ khai nháp – gọi backend thật. Cùng chữ ký với src/mocks/api/declaration.ts.
import { AgentRunViewSchema, DeclarationSchema, DeclarationViewSchema, HsEntrySchema, LineItemSchema, type AgentMode, type AgentRunView, type HsAnswerInput, type HsReclassifyInput } from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";

export const getAgentRun = async (dossierId: string): Promise<AgentRunView | null> => (await apiGet(`dossiers/${dossierId}/agent-run`, z.object({ run: AgentRunViewSchema.nullable() }))).run;
export const startAgentRun = async (dossierId: string, mode: AgentMode) => {
  await apiPost(`dossiers/${dossierId}/agent-run`, { mode }, AgentRunViewSchema);
};
export const listLineItems = (dossierId: string) => apiGet(`dossiers/${dossierId}/line-items`, z.array(LineItemSchema));
export const listHsCatalog = () => apiGet("hs-catalog", z.array(HsEntrySchema));
export const confirmHs = (itemId: string, code: string) => apiPost(`line-items/${itemId}/hs/confirm`, { code }, LineItemSchema);
export const unconfirmHs = (itemId: string) => apiDelete(`line-items/${itemId}/hs/confirm`, LineItemSchema);
export const answerHs = (itemId: string, input: HsAnswerInput) => apiPost(`line-items/${itemId}/hs/answer`, input, LineItemSchema);
export const reclassifyHs = (itemId: string, input: HsReclassifyInput) => apiPost(`line-items/${itemId}/hs/reclassify`, input, LineItemSchema);
export const getDeclarationView = (dossierId: string) => apiGet(`dossiers/${dossierId}/declaration`, DeclarationViewSchema);
export const updateDeclarationField = (dossierId: string, code: string, value: string) => apiPatch(`dossiers/${dossierId}/declaration/fields/${encodeURIComponent(code)}`, { value }, DeclarationSchema);
export const approveDeclaration = (dossierId: string) => apiPost(`dossiers/${dossierId}/declaration/approve`, {}, DeclarationSchema);
export const moveToReview = async (dossierId: string) => {
  await apiPost(`dossiers/${dossierId}/move-to-review`, {}, z.object({ ok: z.literal(true) }));
};
export const reopenDeclaration = async (dossierId: string) => {
  await apiPost(`dossiers/${dossierId}/declaration/reopen`, {}, z.object({ ok: z.literal(true) }));
};
