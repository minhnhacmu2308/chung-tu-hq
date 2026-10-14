// Bước 6: truyền tờ khai, nhật ký, màn Khai báo Hải quan – gọi backend thật. Cùng chữ ký với src/mocks/api/customs.ts.
import { CustomsRowSchema, ResendResultSchema, SubmissionViewSchema, type CustomsOperation } from "@kb/contracts";
import { z } from "zod";
import { apiGet, apiPost } from "@/lib/http";
import { listCertificates } from "./settings";

export { listCertificates };
export const getSubmission = (dossierId: string) => apiGet(`dossiers/${dossierId}/submission`, SubmissionViewSchema);
export const submitDeclaration = async (dossierId: string, certificateId: string) => {
  await apiPost(`dossiers/${dossierId}/submission`, { certificateId }, z.object({ outboxId: z.string() }));
};
export const resendOperation = (dossierId: string, op: CustomsOperation) => apiPost(`dossiers/${dossierId}/submission/resend`, { operation: op }, ResendResultSchema);
export const listCustomsDeclarations = () => apiGet("customs/declarations", z.array(CustomsRowSchema));
