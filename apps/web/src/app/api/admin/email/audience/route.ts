import { previewEmailAudience } from "@kb/core/modules/admin";
import { EmailAudienceSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Đếm + xem mẫu người nhận theo lựa chọn (chưa gửi gì). */
export const POST = route(async (req) => fromResult(await previewEmailAudience(getContainer().admin, await requireStaff(), await parseBody(req, EmailAudienceSchema))));
