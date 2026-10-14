// Hiện thực Notifier: giải người nhận (id, vai trò trong org, chủ hồ sơ) rồi ghi bảng notifications qua uow của identity.
import type { Audience, NotificationDraft, Notifier } from "../../../shared/notifier.js";
import { asOrgId, asUserId, ulidIdGen } from "../../../shared/ids.js";
import type { Clock } from "../../../shared/clock.js";
import type { IdentityUow } from "../application/ports.js";

export function createNotifier(opts: { uow: IdentityUow; clock: Clock; dossierOwner: (orgId: string, dossierId: string) => Promise<string | null> }): Notifier {
  return {
    notify: async (orgId, audience: Audience, draft: NotificationDraft) => {
      const ids = new Set(audience.userIds ?? []);
      if (audience.dossierOwnerOf) {
        const owner = await opts.dossierOwner(orgId, audience.dossierOwnerOf);
        if (owner) ids.add(owner);
      }
      const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
      await opts.uow.asOrg(ctx, async (r) => {
        if (audience.roles?.length) for (const m of await r.memberships.listByOrg(orgId)) if (m.status === "ACTIVE" && audience.roles.includes(m.role)) ids.add(m.userId);
        const now = opts.clock.now();
        for (const userId of ids) await r.notifications.insert({ id: ulidIdGen.next("ntf"), orgId, userId, title: draft.title, body: draft.body, href: draft.href ?? null, readAt: null, createdAt: now });
      });
    },
  };
}
