import { PerformOperationInputSchema } from "@kb/contracts";
import { performOperation } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Thực hiện một nghiệp vụ Hải quan trên tờ khai (IDB, IDC, IDD, IDA01, IDE, AMA…, HYS, CONT, PORT_FEE; tra cứu IID/IEX trả lời ngay). */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { operation } = await parseBody(req, PerformOperationInputSchema);
  return fromResult(await performOperation(getContainer().customs, ctx, params.id!, operation));
});
