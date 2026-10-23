import { runAgent, type DeclarationDeps } from "@kb/core/modules/declaration";
import { createLogger } from "@kb/core/shared";
import { z } from "zod";
import { parsePayload } from "./_payload.js";

const log = createLogger({ name: "worker" });

export const RunAgentPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), dossierId: z.string().min(1), agentRunId: z.string().min(1) });

/** AI Agent: HS → ánh xạ → dựng tờ khai → số hóa. Lỗi tạm (classifier) ném ra để BullMQ retry; task DONE không chạy lại. */
export async function runAgentJob(deps: DeclarationDeps, raw: unknown) {
  const p = parsePayload(RunAgentPayload, raw, "run-agent");
  const r = await runAgent(deps, p);
  if (!r.ok) log.warn("use case trả lỗi nghiệp vụ", { queue: "run-agent", dossierId: p.dossierId, agentRunId: p.agentRunId, orgId: p.orgId, code: r.error.code, message: r.error.message });
  return r.ok ? (r.value.finished ? "ok" : "running") : r.error.code;
}
