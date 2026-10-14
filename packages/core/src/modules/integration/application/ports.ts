import type { IntegrationId } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen } from "../../../shared/ids.js";

export type IntegrationStatusRow = { id: string; orgId: string; kind: IntegrationId; status: "CONNECTED" | "ERROR" | "NOT_CONFIGURED"; detail: string | null; lastCheckedAt: Date | null };

export interface IntegrationStatusRepo {
  list(orgId: string): Promise<IntegrationStatusRow[]>;
  upsert(row: IntegrationStatusRow): Promise<void>;
}

/** Mỗi hệ thống ngoài một probe: đã cấu hình chưa và gọi thử. Adapter thật/giả quyết định ở container. */
export type IntegrationProbe = { configured: boolean; probe(orgId: string): Promise<{ ok: boolean; detail: string }> };

export type IntegrationDeps = {
  statusRepo: IntegrationStatusRepo;
  probes: Record<IntegrationId, IntegrationProbe>;
  clock: Clock;
  idGen: IdGen;
};
