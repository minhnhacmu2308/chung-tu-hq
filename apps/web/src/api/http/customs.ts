// Bước 6: truyền tờ khai, nhật ký, màn Khai báo Hải quan – gọi backend thật. Cùng chữ ký với src/mocks/api/customs.ts.
// `branch`: tờ khai nhánh (lô > 50 dòng tách nhiều tờ), mặc định tờ 1.
import { CustomsRowSchema, OperationResultSchema, ResendResultSchema, SubmissionViewSchema, type CustomsOperation } from "@kb/contracts";
import { z } from "zod";
import { apiGet, apiPost } from "@/lib/http";
import { listCertificates } from "./settings";

export { listCertificates };
export const getSubmission = (dossierId: string) => apiGet(`dossiers/${dossierId}/submission`, SubmissionViewSchema);
export const submitDeclaration = async (dossierId: string, certificateId: string) => {
  await apiPost(`dossiers/${dossierId}/submission`, { certificateId }, z.object({ outboxId: z.string() }));
};
export const resendOperation = (dossierId: string, op: CustomsOperation, branch = 1) => apiPost(`dossiers/${dossierId}/submission/resend`, { operation: op, branch }, ResendResultSchema);
export const performOperation = (dossierId: string, op: CustomsOperation, branch = 1) => apiPost(`dossiers/${dossierId}/submission/operations`, { operation: op, branch }, OperationResultSchema);
export const startPostAmendment = async (dossierId: string, branch = 1) => {
  await apiPost(`dossiers/${dossierId}/submission/post-amendment`, { branch }, z.object({ ok: z.literal(true) }));
};
export const listCustomsDeclarations = () => apiGet("customs/declarations", z.array(CustomsRowSchema));
