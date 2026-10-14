// Bước 4–5: AI Agent, dòng hàng/HS, tờ khai. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/declaration";
import * as http from "./http/declaration";

export const declarationKeys = mock.declarationKeys;
export type { AgentLogLine, AgentMode, AgentRunView, DeclarationItemView, DeclarationView, HsEntry } from "@kb/contracts";

export const getAgentRun = pick(mock.getAgentRun, http.getAgentRun);
export const startAgentRun = pick(mock.startAgentRun, http.startAgentRun);
export const listLineItems = pick(mock.listLineItems, http.listLineItems);
export const listHsCatalog = pick(mock.listHsCatalog, http.listHsCatalog);
export const confirmHs = pick(mock.confirmHs, http.confirmHs);
export const unconfirmHs = pick(mock.unconfirmHs, http.unconfirmHs);
export const getDeclarationView = pick(mock.getDeclarationView, http.getDeclarationView);
export const approveDeclaration = pick(mock.approveDeclaration, http.approveDeclaration);
export const moveToReview = pick(mock.moveToReview, http.moveToReview);
export const updateDeclarationField = http.updateDeclarationField;
