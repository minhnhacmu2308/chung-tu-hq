// Phiên đăng nhập + doanh nghiệp + thông báo (mock).
import type { AcceptInviteInput, Session } from "@kb/contracts";
import { ApiError, mutate, query } from "@/lib/mock-request";
import { getDb, resetDb, saveDb } from "@/mocks/db";
import { emptyCatalog } from "@/mocks/catalog-engine";
import { adminLogin } from "@/mocks/admin/ops";
import { orgView } from "@/mocks/billing-sim";

export const sessionKeys = {
  me: ["session", "me"] as const,
  notifications: ["session", "notifications"] as const,
};

export const getSession = () =>
  query((db): Session => ({
    user: db.members.find((m) => m.id === db.currentUserId)!,
    org: orgView(db),
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

/**
 * Như resetMockData nhưng danh mục hàng hóa về trạng thái chưa thiết lập (chỉ bản dữ liệu mẫu): tab Bộ mã hiện trình thiết lập lần đầu
 * để thử cả hai chế độ (dùng chung một bộ mã / mỗi bộ phận một bộ). Dòng hàng mẫu bỏ liên kết mặt hàng + cờ "Mã lạ" + mã hàng theo danh mục.
 */
export async function resetMockDataEmptyCatalog() {
  await resetMockData();
  const db = getDb();
  db.catalog = emptyCatalog();
  for (const line of db.lineItems) {
    delete line.catalogItem;
    delete line.unknownCode;
    delete line.itemCode;
    delete line.unitFactor;
  }
  saveDb();
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

// ---- Liên kết trong email (nhận lời mời, xác thực email, đặt lại mật khẩu) ----
// Mock không phát token thật: token ngắn hơn 16 ký tự (như VerifyEmailInputSchema) hoặc có chữ "expired"/"invalid"
// → TOKEN_INVALID cùng câu backend; token khác coi như hợp lệ. Thử: /reset-password?token=expired-0000000000000.

/** Token liên kết email hợp lệ trong mock (để thử nhánh hết hạn: `?token=expired-…`). */
export const isMockTokenValid = (token: string) => token.length >= 16 && !/expired|invalid/i.test(token);

const tokenInvalid = (message = "Liên kết không hợp lệ hoặc đã hết hạn") => new ApiError("TOKEN_INVALID", message, 400);

/** Mock nhận lời mời: thành viên đang INVITED đầu tiên đặt tên → ACTIVE và trở thành người đang đăng nhập (như backend cấp phiên). */
export const acceptInvite = (input: AcceptInviteInput) =>
  mutate((db) => {
    if (!isMockTokenValid(input.token)) throw tokenInvalid("Lời mời không hợp lệ hoặc đã hết hạn");
    const invited = db.members.find((m) => m.status === "INVITED");
    if (invited) {
      invited.name = input.name.trim();
      invited.status = "ACTIVE";
      db.currentUserId = invited.id;
    }
    db.admin.currentStaffId = null;
    return { ok: true as const };
  });

export const verifyEmail = (token: string) =>
  mutate(() => {
    if (!isMockTokenValid(token)) throw tokenInvalid();
    return { ok: true as const };
  });

/** Mock quên mật khẩu: luôn "đã gửi" như backend (không lộ email có tồn tại); không gửi email thật. */
export const requestPasswordReset = (_email: string) => mutate(() => ({ ok: true as const }));

export const resetPassword = (input: { token: string; password: string }) =>
  mutate(() => {
    if (!isMockTokenValid(input.token)) throw tokenInvalid();
    if (input.password.length < 8) throw new ApiError("VALIDATION", "Mật khẩu ít nhất 8 ký tự", 400);
    return { ok: true as const };
  });
