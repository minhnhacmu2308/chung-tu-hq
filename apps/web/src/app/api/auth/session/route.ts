import { requireSession } from "@/lib/server/auth";
import { route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => (await requireSession({ allowPasswordChange: true })).session);
