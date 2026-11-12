// Mẫu in hóa đơn thương mại (ADR 0013 mục 3): danh sách (mọi thành viên), tạo (Quản trị).
import { InvoiceTemplateInputSchema } from "@kb/contracts";
import { listInvoiceTemplates, saveInvoiceTemplate } from "@kb/core/modules/extraction";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await listInvoiceTemplates(getContainer().extraction, ctx));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, InvoiceTemplateInputSchema);
  return fromResult(await saveInvoiceTemplate(getContainer().extraction, ctx, null, input));
});
