import { listAnnouncements, sendAnnouncement } from "@kb/core/modules/admin";
import { SendAnnouncementInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => fromResult(await listAnnouncements(getContainer().admin, await requireStaff())));
export const POST = route(async (req) => fromResult(await sendAnnouncement(getContainer().admin, await requireStaff(), await parseBody(req, SendAnnouncementInputSchema))));
