// Luật quản lý quản trị viên – code thuần.
import { staffCan, type AdminPermission, type StaffRole } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

export type StaffStatus = "ACTIVE" | "INVITED" | "DISABLED";
export type StaffActor = { userId: string; name: string; email: string; role: StaffRole; status: StaffStatus };

/** Phiên quản trị hợp lệ + vai trò có quyền. INVITED được coi là hoạt động từ lần đăng nhập đầu (use case session kích hoạt). */
export function requirePermission(actor: StaffActor, permission: AdminPermission): Result<void> {
  if (actor.status === "DISABLED") return err(domainError("UNAUTHENTICATED", "Tài khoản quản trị đã bị khóa"));
  if (!staffCan(actor.role, permission)) return err(domainError("FORBIDDEN", "Vai trò của bạn không được thực hiện thao tác này"));
  return ok(undefined);
}

/** Luôn còn ít nhất một Quản trị cấp cao đang hoạt động – nếu không sẽ không ai sửa được phân quyền. */
export function keepsASuperAdmin(all: { userId: string; role: StaffRole; status: StaffStatus }[], targetId: string, next: { role: StaffRole; status: StaffStatus }): Result<void> {
  const after = all.map((s) => (s.userId === targetId ? { ...s, ...next } : s));
  return after.some((s) => s.role === "SUPER_ADMIN" && s.status === "ACTIVE")
    ? ok(undefined)
    : err(domainError("CONFLICT", "Đây là Quản trị cấp cao duy nhất còn hoạt động – thêm người khác trước"));
}

export const STAFF_ROLE_VI: Record<StaffRole, string> = { SUPER_ADMIN: "Quản trị cấp cao", SUPPORT: "Hỗ trợ", READONLY: "Chỉ xem" };
