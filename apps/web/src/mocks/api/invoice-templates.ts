// Mẫu in hóa đơn thương mại (ADR 0013 mục 3), mock. Backend: packages/core extraction/application/invoice-templates.ts.
import { InvoiceTemplateInputSchema, reasonVi, type InvoiceTemplate, type InvoiceTemplateInput } from "@kb/contracts";
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";

export const invoiceTemplateKeys = { list: ["invoice-templates"] as const };

const requireAdmin = (db: MockDb) => {
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  if (role !== "OWNER" && role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cần vai trò Quản trị hoặc Chủ sở hữu", 403);
};
const notFound = () => new ApiError("NOT_FOUND", reasonVi("INVOICE_TEMPLATE_NOT_FOUND"), 404, { reason: "INVOICE_TEMPLATE_NOT_FOUND" });
const sorted = (db: MockDb) => [...db.invoiceTemplates].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));

export const listInvoiceTemplates = () => query((db) => sorted(db));

export const saveInvoiceTemplate = (id: string | null, raw: InvoiceTemplateInput) =>
  mutate((db): InvoiceTemplate => {
    requireAdmin(db);
    const input = InvoiceTemplateInputSchema.parse(raw);
    const prev = id ? db.invoiceTemplates.find((t) => t.id === id) : undefined;
    if (id && !prev) throw notFound();
    const isDefault = input.isDefault || db.invoiceTemplates.length === 0 || (prev?.isDefault ?? false);
    if (isDefault) db.invoiceTemplates.forEach((t) => (t.isDefault = false));
    const next: InvoiceTemplate = { id: prev?.id ?? newId("itp"), name: input.name, isDefault, layout: input.layout, updatedAt: nowIso() };
    if (prev) Object.assign(prev, next);
    else db.invoiceTemplates.push(next);
    return next;
  });

export const deleteInvoiceTemplate = (id: string) =>
  mutate((db) => {
    requireAdmin(db);
    const prev = db.invoiceTemplates.find((t) => t.id === id);
    if (!prev) throw notFound();
    db.invoiceTemplates = db.invoiceTemplates.filter((t) => t.id !== id);
    const rest = [...db.invoiceTemplates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (prev.isDefault && rest[0]) rest[0].isDefault = true;
    return { ok: true as const };
  });
