// Mẫu in hóa đơn thương mại (ADR 0013 mục 3). Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/invoice-templates";
import * as http from "./http/invoice-templates";

export const invoiceTemplateKeys = mock.invoiceTemplateKeys;
export type { InvoiceLayout, InvoiceTemplate, InvoiceTemplateInput } from "@kb/contracts";

export const listInvoiceTemplates = pick(mock.listInvoiceTemplates, http.listInvoiceTemplates);
export const saveInvoiceTemplate = pick(mock.saveInvoiceTemplate, http.saveInvoiceTemplate);
export const deleteInvoiceTemplate = pick(mock.deleteInvoiceTemplate, http.deleteInvoiceTemplate);
