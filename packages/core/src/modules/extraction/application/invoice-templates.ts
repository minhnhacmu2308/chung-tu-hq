// Mẫu in hóa đơn thương mại của doanh nghiệp (ADR 0013 mục 3): ghép nhóm thông tin chuẩn, nhiều mẫu, tối đa một mẫu mặc định.
// Đọc: mọi thành viên. Ghi: Quản trị (cài đặt doanh nghiệp). Hóa đơn đã phát hành giữ bản chép layout trong snapshot – sửa/xóa mẫu không đổi bản cũ.
import { InvoiceTemplateInputSchema, type InvoiceTemplate, type InvoiceTemplateInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { ExtractionDeps, TemplateRow } from "./ports.js";

export type TemplateDeps = Pick<ExtractionDeps, "uow" | "clock" | "idGen">;

const toDto = (r: TemplateRow): InvoiceTemplate => ({ id: r.id, name: r.name, isDefault: r.isDefault, layout: r.layout, updatedAt: r.updatedAt.toISOString() });
const notFound = () => err(reasonError("NOT_FOUND", "INVOICE_TEMPLATE_NOT_FOUND"));

export async function listInvoiceTemplates(deps: TemplateDeps, ctx: Ctx): Promise<Result<InvoiceTemplate[]>> {
  return ok((await deps.uow.asOrg(ctx, (r) => r.templates.list(ctx.orgId))).map(toDto));
}

/** Tạo (`id` null) hoặc sửa mẫu. Parse Zod lại ở đây (bất biến 9) để áp mặc định. Mẫu đầu tiên tự thành mặc định. */
export async function saveInvoiceTemplate(deps: TemplateDeps, ctx: Ctx, id: string | null, raw: InvoiceTemplateInput): Promise<Result<InvoiceTemplate>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  const parsed = InvoiceTemplateInputSchema.safeParse(raw);
  if (!parsed.success) return err(domainError("VALIDATION", parsed.error.issues[0]?.message ?? "Mẫu hóa đơn không hợp lệ"));
  const input = parsed.data;
  const now = deps.clock.now();
  const row = await deps.uow.asOrg(ctx, async (r) => {
    const all = await r.templates.list(ctx.orgId);
    const prev = id ? all.find((t) => t.id === id) : undefined;
    if (id && !prev) return null;
    const isDefault = input.isDefault || all.length === 0 || (prev?.isDefault ?? false);
    if (isDefault) await r.templates.clearDefault(ctx.orgId);
    if (prev) {
      await r.templates.update(ctx.orgId, prev.id, { name: input.name, isDefault, layout: input.layout, updatedAt: now });
      return { ...prev, name: input.name, isDefault, layout: input.layout, updatedAt: now };
    }
    const next: TemplateRow = { id: deps.idGen.next("itp"), orgId: ctx.orgId, name: input.name, isDefault, layout: input.layout, createdBy: ctx.userId, createdAt: now, updatedAt: now };
    await r.templates.insert(next);
    return next;
  });
  return row ? ok(toDto(row)) : notFound();
}

/** Xóa mẫu. Xóa mẫu mặc định → mẫu sửa gần nhất còn lại thành mặc định. */
export async function deleteInvoiceTemplate(deps: TemplateDeps, ctx: Ctx, id: string): Promise<Result<{ ok: true }>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  const done = await deps.uow.asOrg(ctx, async (r) => {
    const all = await r.templates.list(ctx.orgId);
    const prev = all.find((t) => t.id === id);
    if (!prev) return false;
    await r.templates.delete(ctx.orgId, id);
    const rest = all.filter((t) => t.id !== id).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    if (prev.isDefault && rest[0]) await r.templates.update(ctx.orgId, rest[0].id, { isDefault: true });
    return true;
  });
  return done ? ok({ ok: true }) : notFound();
}
