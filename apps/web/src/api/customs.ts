// Bước 6: truyền tờ khai qua Hải quan. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
// Nhãn nghiệp vụ, giai đoạn và quy tắc bấm được: CUSTOMS_OPERATIONS / CUSTOMS_PHASES trong @kb/contracts.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/customs";
import * as http from "./http/customs";

export const customsKeys = mock.customsKeys;
export type { BranchSubmission, CustomsRow, OperationResult, PipelineRow, PipelineStatus, SubmissionView } from "@kb/contracts";

export const listCertificates = pick(mock.listCertificates, http.listCertificates);
export const getSubmission = pick(mock.getSubmission, http.getSubmission);
export const submitDeclaration = pick(mock.submitDeclaration, http.submitDeclaration);
export const resendOperation = pick(mock.resendOperation, http.resendOperation);
export const performOperation = pick(mock.performOperation, http.performOperation);
export const startPostAmendment = pick(mock.startPostAmendment, http.startPostAmendment);
export const listCustomsDeclarations = pick(mock.listCustomsDeclarations, http.listCustomsDeclarations);
