import { eq } from "drizzle-orm";
import type { IntegrationId } from "@kb/contracts";
import type { Db } from "../../../db/client.js";
import { integrationStatus } from "../../../db/schema/integration.js";
import { withCtx } from "../../../db/with-ctx.js";
import { asOrgId } from "../../../shared/ids.js";
import type { IntegrationStatusRepo, IntegrationStatusRow } from "../application/ports.js";

export class DrizzleIntegrationStatusRepo implements IntegrationStatusRepo {
  constructor(private db: Db) {}
  list(orgId: string) {
    return withCtx(this.db, { orgId: asOrgId(orgId) }, async (tx) =>
      (await tx.select().from(integrationStatus).where(eq(integrationStatus.orgId, orgId))).map((r) => ({
        id: r.id, orgId: r.orgId, kind: r.kind as IntegrationId, status: r.status as IntegrationStatusRow["status"], detail: r.detail, lastCheckedAt: r.lastCheckedAt,
      })),
    );
  }
  upsert(row: IntegrationStatusRow) {
    return withCtx(this.db, { orgId: asOrgId(row.orgId) }, async (tx) => {
      await tx
        .insert(integrationStatus)
        .values({ id: row.id, orgId: row.orgId, kind: row.kind, status: row.status, detail: row.detail, lastCheckedAt: row.lastCheckedAt })
        .onConflictDoUpdate({ target: [integrationStatus.orgId, integrationStatus.kind], set: { status: row.status, detail: row.detail, lastCheckedAt: row.lastCheckedAt, updatedAt: new Date() } });
    });
  }
}
