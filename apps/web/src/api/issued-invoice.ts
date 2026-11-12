// Hóa đơn thương mại sau thông quan (ADR 0013 mục 3). Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/issued-invoice";
import * as http from "./http/issued-invoice";

export const issuedInvoiceKeys = mock.issuedInvoiceKeys;
export type { IssueAction, IssueBlocker, IssuedInvoice, IssuedInvoiceSnapshot, IssuedInvoicesView, ReleaseExtraInput } from "@kb/contracts";

export const getIssuedInvoices = pick(mock.getIssuedInvoices, http.getIssuedInvoices);
export const issueInvoiceAction = pick(mock.issueInvoiceAction, http.issueInvoiceAction);
