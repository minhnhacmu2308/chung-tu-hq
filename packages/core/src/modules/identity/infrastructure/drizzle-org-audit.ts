import type { OrgAuditEntry, OrgAuditWriter } from "../../../shared/audit.js";
import type { Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { IdentityUow } from "../application/ports.js";

/** Ghi org_audit qua uow của identity (ngữ cảnh org của người thao tác); tên người thao tác đọc tại thời điểm ghi. */
export class DrizzleOrgAudit implements OrgAuditWriter {
  constructor(private uow: IdentityUow, private clock: Clock) {}
  async record(ctx: { orgId: string; userId: string }, entry: OrgAuditEntry) {
    await this.uow.asOrg({ orgId: ctx.orgId as never, userId: ctx.userId as never }, async (r) => {
      const actor = ctx.userId ? await r.users.findById(ctx.userId) : null;
      await r.audit.insert({
        id: ulidIdGen.next("aud"), orgId: ctx.orgId, at: this.clock.now(), actorId: ctx.userId || "system", actorName: actor?.name ?? (ctx.userId ? ctx.userId : "Hệ thống"),
        action: entry.action, targetType: entry.targetType, targetId: entry.targetId, targetLabel: entry.targetLabel, detail: entry.detail ?? null,
      });
    });
  }
}
