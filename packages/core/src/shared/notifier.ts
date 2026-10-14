import type { Role } from "@kb/contracts";

/** Người nhận: theo id, theo vai trò trong org, và/hoặc chủ hồ sơ. Composition root giải ra user id (qua identity/dossier). */
export type Audience = { userIds?: string[]; roles?: Role[]; dossierOwnerOf?: string };
export type NotificationDraft = { title: string; body: string; href?: string | null };

/** Cổng thông báo trong ứng dụng (bảng notifications của identity). Module nghiệp vụ chỉ mô tả "ai" và "gì". */
export interface Notifier {
  notify(orgId: string, audience: Audience, draft: NotificationDraft): Promise<void>;
}

export const noopNotifier: Notifier = { notify: async () => {} };

/** Cho test: ghi lại mọi thông báo. */
export class RecordingNotifier implements Notifier {
  readonly sent: { orgId: string; audience: Audience; draft: NotificationDraft }[] = [];
  async notify(orgId: string, audience: Audience, draft: NotificationDraft) {
    this.sent.push({ orgId, audience, draft });
  }
}
