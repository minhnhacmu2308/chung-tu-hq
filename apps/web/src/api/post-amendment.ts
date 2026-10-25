// Bản khai bổ sung sau thông quan (AMA): bản riêng tham chiếu tờ khai gốc. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/post-amendment";
import * as http from "./http/post-amendment";

export const postAmendmentKeys = mock.postAmendmentKeys;
export type { PostAmendment, PostAmendmentLine, PostAmendmentView } from "@kb/contracts";

export const getPostAmendmentView = pick(mock.getPostAmendmentView, http.getPostAmendmentView);
export const updatePostAmendmentField = pick(mock.updatePostAmendmentField, http.updatePostAmendmentField);
export const addPostAmendmentLines = pick(mock.addPostAmendmentLines, http.addPostAmendmentLines);
export const removePostAmendmentLine = pick(mock.removePostAmendmentLine, http.removePostAmendmentLine);
export const approvePostAmendment = pick(mock.approvePostAmendment, http.approvePostAmendment);
export const copyPostAmendmentHeader = pick(mock.copyPostAmendmentHeader, http.copyPostAmendmentHeader);
