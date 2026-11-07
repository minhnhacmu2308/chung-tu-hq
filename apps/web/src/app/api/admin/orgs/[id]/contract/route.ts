import { upsertOrgContract } from "@kb/core/modules/admin";
import { UpsertOrgContractInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Tạo/sửa hợp đồng năm (gói CONTRACT) – ghi nhật ký ORG_CONTRACT_UPDATED. */
export const PUT = route(async (req, p) => fromResult(await upsertOrgContract(getContainer().admin, await requireStaff(), p.id!, await parseBody(req, UpsertOrgContractInputSchema))));
