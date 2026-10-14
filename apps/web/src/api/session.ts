// Phiên, đăng ký/đăng nhập, thông báo. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE (src/lib/data-source.ts).
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/session";
import * as http from "./http/session";

export const sessionKeys = mock.sessionKeys;
export const memberKeys = mock.memberKeys;
export type { CompanyLookup } from "@kb/contracts";

export const getSession = pick(mock.getSession, http.getSession);
export const listNotifications = pick(mock.listNotifications, http.listNotifications);
export const markAllNotificationsRead = pick(mock.markAllNotificationsRead, http.markAllNotificationsRead);
export const login = pick(mock.login, http.login);
export const logout = pick(mock.logout, http.logout);
export const resetMockData = pick(mock.resetMockData, http.resetMockData);
export const listMembers = pick(mock.listMembers, http.listMembers);
export const lookupTaxCode = pick(mock.lookupTaxCode, http.lookupTaxCode);
export const register = pick(mock.register, http.register);
