// Dữ liệu lô hàng nhập tay (ADR 0013 – Khai trước).
import { ManualShipmentSchema } from "@kb/contracts";
import { getManualShipment, saveManualShipment } from "@kb/core/modules/extraction";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getManualShipment(getContainer().extraction, ctx, params.id!));
});
export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, ManualShipmentSchema);
  return fromResult(await saveManualShipment(getContainer().extraction, ctx, params.id!, input));
});
