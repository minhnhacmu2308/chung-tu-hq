// Khai báo định danh hàng hóa – gọi backend thật. Cùng chữ ký với src/mocks/api/identifier.ts.
import { IdentifierViewSchema, type IdentifierRequest } from "@kb/contracts";
import { apiGet, apiPost } from "@/lib/http";

const base = (dossierId: string) => `dossiers/${dossierId}/identifier`;

export const getIdentifier = (dossierId: string) => apiGet(base(dossierId), IdentifierViewSchema);
export const sendIdentifier = (dossierId: string, input: IdentifierRequest) => apiPost(base(dossierId), input, IdentifierViewSchema);
export const pollIdentifier = (dossierId: string) => apiPost(`${base(dossierId)}/poll`, {}, IdentifierViewSchema);
