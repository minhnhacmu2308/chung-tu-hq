import { AdminMfaCodeInputSchema } from "@kb/contracts";
import { verifyMfa } from "@kb/core/modules/admin";
import { sessionToken } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Mỗi phiên: nhập mã 6 số hoặc mã khôi phục. */
export const POST = route(async (req) => fromResult(await verifyMfa(getContainer().admin, await sessionToken(), (await parseBody(req, AdminMfaCodeInputSchema)).code)));
