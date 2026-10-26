// Phiên đăng nhập + doanh nghiệp + thông báo (mock).
import type { Session } from "@kb/contracts";
import { mutate, query } from "@/lib/mock-request";
import { resetDb } from "@/mocks/db";
import { adminLogin } from "@/mocks/admin/ops";

export const sessionKeys = {
  me: ["session", "me"] as const,
  notifications: ["session", "notifications"] as const,
};

export const getSession = () =>
  query((db): Session => ({
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
    const normalized = email.trim().toLowerCase();
    // Đội vận hành KhaiBáo AI đăng nhập CHUNG trang này: quyền quản trị hệ thống là thuộc tính của tài khoản,
    // không phải vai trò trong doanh nghiệp. Đăng nhập xong màn hình tự đưa về khu /admin (xem login-page).
    if (db.admin.staff.some((s) => s.email === normalized)) {
      adminLogin(db, normalized, password);
      return { ok: true as const };
    }
    db.admin.currentStaffId = null;
    const user = db.members.find((m) => m.email === normalized);
    if (user) db.currentUserId = user.id;
    return { ok: true as const };
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

export type { CompanyLookup } from "@kb/contracts";
import type { CompanyLookup } from "@kb/contracts";

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
export const register = (_input: { email: string; name: string; password: string; taxCode: string; joinExisting: boolean }) =>
  mutate(() => ({ ok: true as const, mode: _input.joinExisting ? ("JOIN_REQUESTED" as const) : ("CREATED_ORG" as const) }));

/** Mock đổi mật khẩu: không lưu mật khẩu – chỉ kiểm như backend (mới ≥ 8 ký tự, khác mật khẩu cũ). */
export const changePassword = (input: { currentPassword: string; newPassword: string }) =>
  mutate(() => {
    if (!input.currentPassword) throw new Error("Mật khẩu hiện tại không đúng");
    if (input.newPassword.length < 8 || input.newPassword === input.currentPassword) throw new Error("Mật khẩu mới không hợp lệ");
    return { ok: true as const };
  });

/** Mock đăng xuất: không có phiên thật. */
export const logout = () =>
  mutate((db) => {
    db.admin.currentStaffId = null;
    return { ok: true as const };
  });
