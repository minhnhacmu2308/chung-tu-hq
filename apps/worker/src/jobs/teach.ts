import { processTeachSample, type TeachDeps } from "@kb/core/modules/teaching";
import { createLogger } from "@kb/core/shared";
import { z } from "zod";
import { parsePayload } from "./_payload.js";

const log = createLogger({ name: "worker" });

export const TeachSampleReadPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), sampleId: z.string().min(1) });

/** Dạy khai báo: AI đọc tờ khai đã thông quan → so với tờ khai nháp cùng lô → bài học chờ duyệt. Lỗi tạm (AI 429/5xx) ném ra để BullMQ retry. */
export async function teachSampleReadJob(deps: TeachDeps, raw: unknown) {
  const p = parsePayload(TeachSampleReadPayload, raw, "teach-sample-read");
  const r = await processTeachSample(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "teach-sample-read", sampleId: p.sampleId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? "ok" : r.error.code;
}
