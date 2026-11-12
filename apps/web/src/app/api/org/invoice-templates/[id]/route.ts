// Mẫu in hóa đơn thương mại: sửa / xóa (Quản trị). Hóa đơn đã phát hành giữ bản chép mẫu – không đổi theo.
import { InvoiceTemplateInputSchema } from "@kb/contracts";
import { deleteInvoiceTemplate, saveInvoiceTemplate } from "@kb/core/modules/extraction";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, InvoiceTemplateInputSchema);
  return fromResult(await saveInvoiceTemplate(getContainer().extraction, ctx, params.id!, input));
});
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await deleteInvoiceTemplate(getContainer().extraction, ctx, params.id!));
});
