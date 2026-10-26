import { processEmailCampaign } from "@kb/core/modules/admin";
import { z } from "zod";
import { parsePayload } from "./_payload.js";

const Payload = z.object({ campaignId: z.string().min(1) });

/** Gửi một đợt email (khu Quản trị): gửi dần người nhận còn chờ; job thử lại chỉ gửi phần còn thiếu. */
export async function emailCampaignJob(deps: Parameters<typeof processEmailCampaign>[0], data: unknown) {
  const { campaignId } = parsePayload(Payload, data, "email-campaign");
  const r = await processEmailCampaign(deps, campaignId);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message ?? ""}`);
  return `${r.value.status}: ${r.value.sent}/${r.value.total} đã gửi, ${r.value.failed} lỗi`;
}
