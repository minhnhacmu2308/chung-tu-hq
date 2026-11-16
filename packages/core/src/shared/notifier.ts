import { NotificationEventSchema, type NotificationEvent, type Role } from "@kb/contracts";

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

/** Kênh Redis duy nhất cho thông báo realtime (ADR 0017); người nhận nằm trong payload, web lọc theo phiên. */
export const NOTIFICATION_CHANNEL = "kb:notify";

/** Cổng đẩy thông báo vừa ghi tới trình duyệt đang mở (Redis pub/sub). Lỗi đẩy không được làm hỏng việc ghi thông báo. */
export interface NotificationPublisher {
  publish(event: NotificationEvent): Promise<void>;
}

export const noopNotificationPublisher: NotificationPublisher = { publish: async () => {} };

/**
 * Lọc + parse một message của kênh cho đúng một phiên: chỉ trả sự kiện của chính `userId` trong chính `orgId`;
 * message hỏng (không phải JSON, sai schema) → null. Thuần, dùng ở route SSE.
 */
export function notificationEventFor(ctx: { orgId: string; userId: string }, raw: string): NotificationEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const e = NotificationEventSchema.safeParse(json);
  return e.success && e.data.orgId === ctx.orgId && e.data.userId === ctx.userId ? e.data : null;
}
