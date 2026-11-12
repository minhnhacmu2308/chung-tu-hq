import { InvoiceTemplateSchema, type InvoiceTemplateInput } from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/http";

export const listInvoiceTemplates = () => apiGet("org/invoice-templates", z.array(InvoiceTemplateSchema));
export const saveInvoiceTemplate = (id: string | null, input: InvoiceTemplateInput) =>
  id ? apiPut(`org/invoice-templates/${id}`, input, InvoiceTemplateSchema) : apiPost("org/invoice-templates", input, InvoiceTemplateSchema);
export const deleteInvoiceTemplate = (id: string) => apiDelete(`org/invoice-templates/${id}`, z.object({ ok: z.literal(true) }));
