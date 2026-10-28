const DAY = 86_400_000;
export const SESSION_TTL_MS = 30 * DAY;
const EXTEND_WHEN_LEFT_MS = 15 * DAY;

export const sessionExpiry = (now: Date) => new Date(now.getTime() + SESSION_TTL_MS);
export const isExpired = (s: { expiresAt: Date }, now: Date) => s.expiresAt.getTime() <= now.getTime();
/** Gia hạn trượt khi phiên còn dưới 15 ngày. */
export const shouldExtend = (s: { expiresAt: Date }, now: Date) => s.expiresAt.getTime() - now.getTime() < EXTEND_WHEN_LEFT_MS;
const TOUCH_EVERY_MS = 60_000;
/** Ghi "lần cuối hoạt động" tối đa mỗi phút (hoặc khi cần gia hạn): mỗi request đều UPDATE cùng một dòng phiên thì các request song song tranh khóa dòng đó. */
export const shouldTouch = (s: { expiresAt: Date; lastSeenAt: Date }, now: Date) => shouldExtend(s, now) || now.getTime() - s.lastSeenAt.getTime() >= TOUCH_EVERY_MS;
