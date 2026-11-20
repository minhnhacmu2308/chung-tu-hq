import { IdentifierBatchRequestSchema, IdentifierListQuerySchema } from "@kb/contracts";
import { listIdentifiers, requestIdentifierBatch } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, parseQuery, route } from "@/lib/server/route";

/** Danh sách số định danh của doanh nghiệp (lọc, phân trang, đếm sắp hết hạn). */
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await listIdentifiers(getContainer().customs, ctx, parseQuery(req, IdentifierListQuerySchema)));
});

/** Xin N số định danh theo lô: tạo dòng SENDING + job `identifier-send`; `clientKey` chống gửi lặp. */
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, IdentifierBatchRequestSchema);
  return fromResult(await requestIdentifierBatch(getContainer().customs, ctx, input));
});
