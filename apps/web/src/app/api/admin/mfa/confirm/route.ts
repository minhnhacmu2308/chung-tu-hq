import { AdminMfaCodeInputSchema } from "@kb/contracts";
import { confirmMfaSetup } from "@kb/core/modules/admin";
import { sessionToken } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Xác nhận mã đầu tiên → bật 2FA, trả mã khôi phục (chỉ một lần). */
export const POST = route(async (req) => fromResult(await confirmMfaSetup(getContainer().admin, await sessionToken(), (await parseBody(req, AdminMfaCodeInputSchema)).code)));
