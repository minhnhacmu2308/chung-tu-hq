import { getAdminSession } from "@kb/core/modules/admin";
import { sessionToken } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Phiên hiện tại có quyền quản trị hệ thống không: { session: AdminSession | null } (không phải quản trị viên → null, không lỗi). */
export const GET = route(async () => ({ session: fromResult(await getAdminSession(getContainer().admin, await sessionToken())) }));
