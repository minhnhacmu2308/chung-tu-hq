// Phiên đăng nhập + doanh nghiệp + thông báo (mock).
import { mutate, query } from "@/lib/mock-request";
import { resetDb } from "@/mocks/db";

export const sessionKeys = {
  me: ["session", "me"] as const,
  notifications: ["session", "notifications"] as const,
};

export const getSession = () =>
  query((db) => ({
    user: db.members.find((m) => m.id === db.currentUserId)!,
    org: db.org,
  }));

export const listNotifications = () => query((db) => db.notifications);

export const markAllNotificationsRead = () =>
  mutate((db) => {
    db.notifications.forEach((n) => (n.read = true));
  });

/** Mock đăng nhập: chấp nhận mọi email + mật khẩu ≥ 6 ký tự. */
export const login = (email: string, password: string) =>
  mutate((db) => {
    if (password.length < 6) throw new Error("Sai email hoặc mật khẩu");
    const user = db.members.find((m) => m.email === email.trim().toLowerCase());
    if (user) db.currentUserId = user.id;
    return { ok: true };
  });

export async function resetMockData() {
  resetDb();
  try {
    window.localStorage.removeItem("kb-mock-skill-samples"); // mẫu skill upload (api/skills.ts lưu riêng)
  } catch {
    /* bỏ qua */
  }
}

export const memberKeys = { all: ["members"] as const };

/** Thành viên doanh nghiệp (dùng hiển thị người phụ trách). */
export const listMembers = () => query((db) => db.members);

export type CompanyLookup =
  | { found: false }
  | { found: true; existing: boolean; name: string; address: string };

/** Mock tra cứu MST (thông tin đăng ký thuế). MST trùng doanh nghiệp đã có → existing = true. */
export const lookupTaxCode = (taxCode: string) =>
  query<CompanyLookup>((db) => {
    const code = taxCode.replace(/\D/g, "");
    if (code === db.org.taxCode) return { found: true, existing: true, name: db.org.name, address: db.org.address };
    if (code.endsWith("000")) return { found: false };
    return {
      found: true,
      existing: false,
      name: "CÔNG TY CỔ PHẦN XUẤT NHẬP KHẨU MINH KHANG",
      address: "Số 18 đường Lê Hồng Phong, phường Đông Khê, quận Ngô Quyền, TP. Hải Phòng",
    };
  });

/** Mock đăng ký: luôn thành công. */
export const register = (_input: { email: string; name: string; taxCode: string; joinExisting: boolean }) =>
  mutate(() => ({ ok: true }));
