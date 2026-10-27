import { TeachSettingsSchema } from "@kb/contracts";
import { setTeachEnabled } from "@kb/core/modules/teaching";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Bật/tắt "Dùng bài học khi dựng tờ khai nháp" (Quản trị). */
export const PUT = route(async (req) => {
  const { ctx } = await requireSession();
  const { enabled } = await parseBody(req, TeachSettingsSchema);
  return fromResult(await setTeachEnabled(getContainer().teach, ctx, enabled));
});
