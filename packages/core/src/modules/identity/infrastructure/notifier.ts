// Hiện thực Notifier: giải người nhận (id, vai trò trong org, chủ hồ sơ) rồi ghi bảng notifications qua uow của identity.
// Ghi xong (transaction đã commit) mới đẩy sự kiện realtime (ADR 0017); đẩy lỗi chỉ ghi log – thông báo vẫn nằm trong DB.
import { notificationCategory, type NotificationEvent } from "@kb/contracts";
import { noopNotificationPublisher, type Audience, type NotificationDraft, type NotificationPublisher, type Notifier } from "../../../shared/notifier.js";
import { asOrgId, asUserId, ulidIdGen } from "../../../shared/ids.js";
import type { Clock } from "../../../shared/clock.js";
import { createLogger, type Logger } from "../../../shared/log.js";
import type { IdentityUow } from "../application/ports.js";

export function createNotifier(opts: {
  uow: IdentityUow;
  clock: Clock;
  dossierOwner: (orgId: string, dossierId: string) => Promise<string | null>;
  publisher?: NotificationPublisher;
  log?: Logger;
}): Notifier {
  const publisher = opts.publisher ?? noopNotificationPublisher;
  const log = opts.log ?? createLogger({ name: "notifier" });
  return {
    notify: async (orgId, audience: Audience, draft: NotificationDraft) => {
      const ids = new Set(audience.userIds ?? []);
      if (audience.dossierOwnerOf) {
        const owner = await opts.dossierOwner(orgId, audience.dossierOwnerOf);
        if (owner) ids.add(owner);
      }
      const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
      const events: NotificationEvent[] = [];
      await opts.uow.asOrg(ctx, async (r) => {
        if (audience.roles?.length) for (const m of await r.memberships.listByOrg(orgId)) if (m.status === "ACTIVE" && audience.roles.includes(m.role)) ids.add(m.userId);
        const now = opts.clock.now();
        for (const userId of ids) {
          const row = { id: ulidIdGen.next("ntf"), orgId, userId, title: draft.title, body: draft.body, href: draft.href ?? null, readAt: null, createdAt: now };
          await r.notifications.insert(row);
          events.push({ id: row.id, orgId, userId, category: notificationCategory(row), title: row.title, body: row.body, href: row.href, at: now.toISOString() });
        }
      });
      // Không await: Redis dùng maxRetriesPerRequest=null nên khi mất kết nối lệnh PUBLISH chờ mãi – không được giữ job/request.
      for (const e of events)
        void Promise.resolve()
          .then(() => publisher.publish(e))
          .catch((err: unknown) => log.warn("không đẩy được thông báo realtime", { orgId, notificationId: e.id, err }));
    },
  };
}
