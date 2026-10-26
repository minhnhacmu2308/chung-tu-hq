import { draftEmailWithAi } from "@kb/core/modules/admin";
import { DraftEmailInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** AI soạn mẫu theo mô tả (ADR 0008) – trả về khối để người soạn sửa tiếp, không gửi gì. */
export const POST = route(async (req) => fromResult(await draftEmailWithAi(getContainer().admin, await requireStaff(), await parseBody(req, DraftEmailInputSchema))));
