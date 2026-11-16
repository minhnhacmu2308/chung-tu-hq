// Phiên, thông báo, đăng ký/đăng nhập – gọi backend thật. Cùng chữ ký với src/mocks/api/session.ts.
import { type AcceptInviteInput, CompanyLookupSchema, MemberSchema, NotificationEventSchema, NotificationPageSchema, OkSchema, RegisterResultSchema, SessionSchema, type CompanyLookup, type NotificationListQuery, type NotificationStreamHandlers } from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";

export type { CompanyLookup };

export const getSession = () => apiGet("auth/session", SessionSchema);
export const listNotifications = (q: NotificationListQuery = {}) => {
  const params = new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]])));
  return apiGet(`notifications${params.size ? `?${params}` : ""}`, NotificationPageSchema);
};
export const setNotificationRead = async (id: string, read: boolean) => {
  await apiPatch(`notifications/${encodeURIComponent(id)}`, { read }, OkSchema);
};
export const deleteNotification = async (id: string) => {
  await apiDelete(`notifications/${encodeURIComponent(id)}`, OkSchema);
};
/** SSE thông báo realtime (ADR 0017). EventSource tự nối lại (server gửi `retry: 5000`); trả hàm đóng. */
export const subscribeNotifications = (h: NotificationStreamHandlers): (() => void) => {
  const es = new EventSource("/api/notifications/stream");
  es.addEventListener("ready", () => h.onOpen());
  es.onmessage = (m: MessageEvent<string>) => {
    try {
      const e = NotificationEventSchema.safeParse(JSON.parse(m.data));
      if (e.success) h.onEvent(e.data);
    } catch {
      /* bỏ qua message hỏng */
    }
  };
  es.onerror = () => h.onError(es.readyState === EventSource.CLOSED);
  return () => es.close();
};
export const markAllNotificationsRead = async () => {
  await apiPost("notifications/read-all", {}, OkSchema);
};
export const login = (email: string, password: string) => apiPost("auth/login", { email, password }, OkSchema);
export const logout = () => apiPost("auth/logout", {}, OkSchema);
export const changePassword = (input: { currentPassword: string; newPassword: string }) => apiPost("auth/password/change", input, OkSchema);
/** Dev/test: nạp lại dữ liệu mẫu trên server. */
export const resetMockData = async () => {
  await apiPost("dev/reset-demo", {}, OkSchema);
};
/** Chỉ có ở bản dữ liệu mẫu (menu ẩn khi chạy backend thật). */
export const resetMockDataEmptyCatalog = async (): Promise<void> => {
  throw new Error("resetMockDataEmptyCatalog: chỉ dùng ở chế độ dữ liệu mẫu");
};
export const listMembers = () => apiGet("org/members", z.array(MemberSchema));
export const lookupTaxCode = (taxCode: string) => apiGet(`auth/lookup-tax-code?taxCode=${encodeURIComponent(taxCode)}`, CompanyLookupSchema);
export const register = (input: { email: string; name: string; password: string; taxCode: string; joinExisting: boolean }) =>
  apiPost("auth/register", input, RegisterResultSchema);
/** Người được mời đặt tên + mật khẩu; thành công → server đặt cookie phiên (đăng nhập luôn). */
export const acceptInvite = (input: AcceptInviteInput) => apiPost("auth/invites/accept", input, OkSchema);
export const verifyEmail = (token: string) => apiPost("auth/verify-email", { token }, OkSchema);
/** Luôn ok (không lộ email có tồn tại); chỉ lỗi khi RATE_LIMITED. */
export const requestPasswordReset = (email: string) => apiPost("auth/password/forgot", { email }, OkSchema);
export const resetPassword = (input: { token: string; password: string }) => apiPost("auth/password/reset", input, OkSchema);
