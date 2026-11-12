import { InvoiceSettingsInputSchema } from "@kb/contracts";
import { updateInvoiceSettings } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Cài đặt hóa đơn xuất khẩu (mẫu số, người ký, tên người bán). Chỉ Quản trị / Chủ sở hữu. */
export const PATCH = route(async (req) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, InvoiceSettingsInputSchema);
  return fromResult(await updateInvoiceSettings(getContainer().identity, ctx, input));
});
