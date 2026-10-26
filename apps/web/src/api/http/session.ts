// Phiên, thông báo, đăng ký/đăng nhập – gọi backend thật. Cùng chữ ký với src/mocks/api/session.ts.
import { CompanyLookupSchema, MemberSchema, NotificationSchema, OkSchema, RegisterResultSchema, SessionSchema, type CompanyLookup } from "@kb/contracts";
import { z } from "zod";
import { apiGet, apiPost } from "@/lib/http";

export type { CompanyLookup };

export const getSession = () => apiGet("auth/session", SessionSchema);
export const listNotifications = () => apiGet("notifications", z.array(NotificationSchema));
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
export const listMembers = () => apiGet("org/members", z.array(MemberSchema));
export const lookupTaxCode = (taxCode: string) => apiGet(`auth/lookup-tax-code?taxCode=${encodeURIComponent(taxCode)}`, CompanyLookupSchema);
export const register = (input: { email: string; name: string; password: string; taxCode: string; joinExisting: boolean }) =>
  apiPost("auth/register", input, RegisterResultSchema);
