import { startMfaSetup } from "@kb/core/modules/admin";
import { sessionToken } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Bắt đầu thiết lập xác thực 2 lớp: khóa mới + mã QR (chưa có hiệu lực tới khi xác nhận mã đầu tiên). */
export const POST = route(async () => fromResult(await startMfaSetup(getContainer().admin, await sessionToken())));
