import type { Integration } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { INTEGRATIONS, ORG_VISIBLE } from "./_catalog.js";
import type { IntegrationDeps } from "./ports.js";

/** Chỉ các kết nối doanh nghiệp được thấy (`ORG_VISIBLE`). Trạng thái = kết quả kiểm tra gần nhất; chưa kiểm tra → suy từ cấu hình (configured → CONNECTED, ngược lại NOT_CONFIGURED). */
export async function listIntegrations(deps: IntegrationDeps, ctx: Ctx): Promise<Result<Integration[]>> {
  const rows = await deps.statusRepo.list(ctx.orgId);
  return ok(
    INTEGRATIONS.filter((it) => ORG_VISIBLE.includes(it.id)).map((it) => {
      const row = rows.find((r) => r.kind === it.id);
      const probe = deps.probes[it.id];
      const status = row?.status ?? (probe.configured ? "CONNECTED" : "NOT_CONFIGURED");
      return {
        ...it,
        status,
        ...(row?.lastCheckedAt ? { lastCheckedAt: row.lastCheckedAt.toISOString() } : {}),
        ...(row?.detail ? { detail: row.detail } : {}),
      };
    }),
  );
}
