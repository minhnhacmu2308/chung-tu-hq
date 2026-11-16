// Khai báo định danh hàng hóa (V5IdentifierReq/Res). Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/identifier";
import * as http from "./http/identifier";

export type { IdentifierRequest, IdentifierView } from "@kb/contracts";

export const identifierKeys = mock.identifierKeys;

export const getIdentifier = pick(mock.getIdentifier, http.getIdentifier);
export const sendIdentifier = pick(mock.sendIdentifier, http.sendIdentifier);
export const pollIdentifier = pick(mock.pollIdentifier, http.pollIdentifier);
