// Nghiệp vụ khác – số định danh xin theo lô (danh sách, đăng ký, xóa, gửi lại, dùng số). Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/customs-ops";
import * as http from "./http/customs-ops";

export type { IdentifierBatchRequest, IdentifierDisplayStatus, IdentifierList, IdentifierListItem, IdentifierListQuery } from "@kb/contracts";

export const customsOpsKeys = mock.customsOpsKeys;

export const listIdentifiers = pick(mock.listIdentifiers, http.listIdentifiers);
export const requestIdentifierBatch = pick(mock.requestIdentifierBatch, http.requestIdentifierBatch);
export const deleteIdentifiers = pick(mock.deleteIdentifiers, http.deleteIdentifiers);
export const retryIdentifier = pick(mock.retryIdentifier, http.retryIdentifier);
export const pollIdentifierRow = pick(mock.pollIdentifierRow, http.pollIdentifierRow);
export const takeIdentifier = pick(mock.takeIdentifier, http.takeIdentifier);
export const releaseIdentifier = pick(mock.releaseIdentifier, http.releaseIdentifier);
