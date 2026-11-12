import { IssuedInvoicesViewSchema, type IssueAction } from "@kb/contracts";
import { apiGet, apiPost } from "@/lib/http";

export const getIssuedInvoices = (dossierId: string) => apiGet(`dossiers/${dossierId}/issued-invoice`, IssuedInvoicesViewSchema);
export const issueInvoiceAction = (dossierId: string, action: IssueAction) => apiPost(`dossiers/${dossierId}/issued-invoice`, action, IssuedInvoicesViewSchema);
