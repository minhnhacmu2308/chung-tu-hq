import { createOrg, listOrgs } from "@kb/core/modules/admin";
import { CreateOrgInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => fromResult(await listOrgs(getContainer().admin, await requireStaff())));
/** Tạo hộ doanh nghiệp ký hợp đồng trực tiếp; kết quả có mật khẩu tạm của Chủ sở hữu (chỉ trả một lần). */
export const POST = route(async (req) => fromResult(await createOrg(getContainer().admin, await requireStaff(), await parseBody(req, CreateOrgInputSchema))));
