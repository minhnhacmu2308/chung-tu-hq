import type { Role } from "@kb/contracts";
import { domainError } from "./errors.js";
import type { OrgId, UserId } from "./ids.js";
import { err, ok, type Result } from "./result.js";

/** Ngữ cảnh gọi use case: luôn có org và người dùng đã đăng nhập. */
export type Ctx = { orgId: OrgId; userId: UserId; role: Role };

export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, DECLARANT: 1, APPROVER: 2, ADMIN: 3, OWNER: 4 };

/** OWNER luôn được phép; vai trò khác phải nằm trong danh sách. */
export function requireRole(ctx: Ctx, ...roles: Role[]): Result<void> {
  if (ctx.role === "OWNER" || roles.includes(ctx.role)) return ok(undefined);
  return err(domainError("FORBIDDEN", `Cần vai trò ${roles.join("/")}`));
}
