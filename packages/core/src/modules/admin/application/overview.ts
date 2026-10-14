// Tổng quan vận hành.
import type { AdminOverview } from "@kb/contracts";
import { ok, type Result } from "../../../shared/result.js";
import { buildAttention } from "../domain/attention.js";
import { guarded, sumMoney, type StaffActor } from "./_shared.js";
import { orgSnapshot } from "./orgs.js";
import { PLATFORM_INTEGRATIONS } from "./platform.js";
import type { AdminDeps } from "./ports.js";

const DAY = 86_400_000;

export async function getOverview(deps: AdminDeps, actor: StaffActor): Promise<Result<AdminOverview>> {
  return guarded(actor, "VIEW", async () => {
    const now = deps.clock.now();
    const failedJobs = (await deps.jobs.stats()).reduce((n, q) => n + q.failed, 0);
    return deps.uow.run(async (r) => {
      const snap = await orgSnapshot(deps, r);
      const [integrations, joins] = await Promise.all([r.platformIntegrations.list(), r.joins.listPending()]);
      const orgs = snap.orgs.map(snap.toDto);
      const active = orgs.filter((o) => o.status === "ACTIVE");
      const accounts = new Map<string, Date | null>();
      for (const m of snap.members) {
        const prev = accounts.get(m.userId);
        if (prev === undefined || (m.lastSeenAt && (!prev || m.lastSeenAt > prev))) accounts.set(m.userId, m.lastSeenAt);
      }
      return ok({
        orgs: { active: active.length, suspended: orgs.length - active.length, new30d: orgs.filter((o) => now.getTime() - new Date(o.createdAt).getTime() <= 30 * DAY).length },
        users: { total: accounts.size, active7d: [...accounts.values()].filter((d) => d && now.getTime() - d.getTime() <= 7 * DAY).length },
        dossiersThisMonth: orgs.reduce((n, o) => n + o.usage.dossiersThisMonth, 0),
        aiCostVnd: sumMoney(orgs.map((o) => o.usage.aiCostVnd)),
        attention: buildAttention({
          orgs,
          integrations: integrations.map((i) => ({ id: i.id, name: PLATFORM_INTEGRATIONS.find((p) => p.id === i.id)?.name ?? i.id, status: i.status, detail: i.detail ?? undefined })),
          failedJobs,
          pendingJoins: joins.map((j) => j.requestedAt),
          now,
        }),
        recentOrgs: [...orgs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      });
    });
  });
}
