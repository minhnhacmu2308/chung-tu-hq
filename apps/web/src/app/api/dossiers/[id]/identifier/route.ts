import { IdentifierRequestSchema } from "@kb/contracts";
import { getIdentifier, sendIdentifier } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Khai báo định danh hàng hóa của hồ sơ: lần gửi gần nhất (số định danh, QR, trạng thái). */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getIdentifier(getContainer().customs, ctx, params.id!));
});

/** Gửi khai báo định danh (V5IdentifierReq): bản ghi SENDING + job identifier-send – không gọi FPT trong request web. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, IdentifierRequestSchema);
  return fromResult(await sendIdentifier(getContainer().customs, ctx, params.id!, input));
});
