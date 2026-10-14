// Thông báo hệ thống: gửi tới mọi thành viên đang hoạt động của các doanh nghiệp nhận; thu hồi xóa các bản đã gửi.
import type { AdminReasonInput, Announcement, AnnouncementAudience, SendAnnouncementInput } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { audit, guarded, type StaffActor } from "./_shared.js";
import type { AdminDeps, AnnouncementRow } from "./ports.js";

const toAnnouncement = (a: AnnouncementRow): Announcement => ({
  id: a.id, title: a.title, body: a.body, kind: a.kind as Announcement["kind"], audience: a.audience as AnnouncementAudience,
  ...(a.maintenanceDate ? { maintenanceDate: a.maintenanceDate } : {}), status: a.status, sentAt: a.sentAt.toISOString(), sentByName: a.sentByName, recipients: a.recipients,
});

export async function listAnnouncements(deps: AdminDeps, actor: StaffActor): Promise<Result<Announcement[]>> {
  return guarded(actor, "VIEW", () => deps.uow.run(async (r) => ok((await r.announcements.list()).map(toAnnouncement))));
}

/** Doanh nghiệp đang tạm khóa không nhận. `recipients` = số doanh nghiệp nhận. */
export async function sendAnnouncement(deps: AdminDeps, actor: StaffActor, input: SendAnnouncementInput): Promise<Result<Announcement>> {
  return guarded(actor, "SUPPORT", () =>
    deps.uow.run(async (r) => {
      const orgs = (await r.orgs.list()).filter((o) => o.status === "ACTIVE" && (input.audience === "ALL" || o.planCode === input.audience));
      if (orgs.length === 0) return err(domainError("CONFLICT", "Không có doanh nghiệp nào thuộc nhóm nhận đã chọn"));
      const now = deps.clock.now();
      const row: AnnouncementRow = {
        id: deps.idGen.next("ann"), title: input.title, body: input.body, kind: input.kind, audience: input.audience,
        maintenanceDate: input.kind === "MAINTENANCE" ? (input.maintenanceDate ?? null) : null, status: "SENT", sentAt: now, sentBy: actor.userId, sentByName: actor.name, recipients: orgs.length,
      };
      await r.announcements.insert(row);
      const people = await r.members.activeRecipients(orgs.map((o) => o.id));
      await r.notifications.insertMany(people.map((p) => ({ id: deps.idGen.next("ntf"), orgId: p.orgId, userId: p.userId, title: row.title, body: row.body, announcementId: row.id, at: now })));
      await audit(deps, r, actor, "ANNOUNCEMENT_SENT", { type: "ANNOUNCEMENT", id: row.id, label: row.title }, "Gửi thông báo hệ thống", `${orgs.length} doanh nghiệp nhận`);
      return ok(toAnnouncement(row));
    }),
  );
}

export async function withdrawAnnouncement(deps: AdminDeps, actor: StaffActor, id: string, input: AdminReasonInput): Promise<Result<Announcement>> {
  return guarded(actor, "SUPPORT", () =>
    deps.uow.run(async (r) => {
      const a = await r.announcements.get(id);
      if (!a) return err(domainError("NOT_FOUND", "Không tìm thấy thông báo"));
      if (a.status === "WITHDRAWN") return err(domainError("CONFLICT", "Thông báo này đã được thu hồi"));
      await r.notifications.deleteByAnnouncement(id);
      await r.announcements.setStatus(id, "WITHDRAWN");
      await audit(deps, r, actor, "ANNOUNCEMENT_WITHDRAWN", { type: "ANNOUNCEMENT", id, label: a.title }, input.reason);
      return ok(toAnnouncement({ ...a, status: "WITHDRAWN" }));
    }),
  );
}
