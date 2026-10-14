import { runAgent, type DeclarationDeps } from "@kb/core/modules/declaration";
import { z } from "zod";

export const RunAgentPayload = z.object({ orgId: z.string().min(1), userId: z.string().min(1), dossierId: z.string().min(1), agentRunId: z.string().min(1) });

/** AI Agent: HS → ánh xạ → dựng tờ khai → số hóa. Lỗi tạm (classifier) ném ra để BullMQ retry; task DONE không chạy lại. */
export async function runAgentJob(deps: DeclarationDeps, raw: unknown) {
  const p = RunAgentPayload.parse(raw);
  const r = await runAgent(deps, p);
  if (!r.ok) console.warn(`[run-agent] ${p.dossierId}: ${r.error.code} ${r.error.message ?? ""}`);
  return r.ok ? (r.value.finished ? "ok" : "running") : r.error.code;
}
