import type { Role } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

const forbid = (m: string) => err(domainError("FORBIDDEN", m));
const isManager = (r: Role) => r === "OWNER" || r === "ADMIN";

type Target = { role: Role; isSelf: boolean };

export function canManageOrg(actor: Role): Result<void> {
  return isManager(actor) ? ok(undefined) : forbid("Cần vai trò Quản trị hoặc Chủ sở hữu");
}
export const canInvite = canManageOrg;
export const canManageCertificates = canManageOrg;

export function canChangeRole(actor: Role, target: Target, next: Role): Result<void> {
  if (!isManager(actor)) return forbid("Cần vai trò Quản trị hoặc Chủ sở hữu");
  if (target.role === "OWNER") return forbid("Muốn đổi Chủ sở hữu phải chuyển quyền sở hữu");
  if (next === "OWNER") return forbid("Dùng chức năng chuyển quyền sở hữu");
  if (target.isSelf) return forbid("Không thể tự đổi vai trò của mình");
  return ok(undefined);
}

export function canDisable(actor: Role, target: Target): Result<void> {
  if (!isManager(actor)) return forbid("Cần vai trò Quản trị hoặc Chủ sở hữu");
  if (target.isSelf) return forbid("Không thể tự khóa tài khoản của mình");
  if (target.role === "OWNER") return forbid("Không thể khóa Chủ sở hữu");
  return ok(undefined);
}

type OwnershipTarget = { role: Role; status: "ACTIVE" | "INVITED" | "DISABLED"; isSelf: boolean };

/** Chuyển quyền sở hữu: chỉ Chủ sở hữu hiện tại; người nhận là thành viên ĐANG HOẠT ĐỘNG khác mình. */
export function canTransferOwnership(actor: Role, target: OwnershipTarget): Result<void> {
  if (actor !== "OWNER") return forbid("Chỉ Chủ sở hữu được chuyển quyền sở hữu");
  if (target.isSelf) return forbid("Không thể chuyển quyền sở hữu cho chính mình");
  if (target.role === "OWNER") return forbid("Người này đã là Chủ sở hữu");
  if (target.status !== "ACTIVE") return err(domainError("INVALID_STATE", "Chỉ chuyển được cho thành viên đang hoạt động"));
  return ok(undefined);
}
