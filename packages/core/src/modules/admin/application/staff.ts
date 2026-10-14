// Phiên quản trị, quản trị viên, nhật ký quản trị.
import type { AdminAuditEntry, AdminReasonInput, AdminSession, ChangeStaffRoleInput, InviteStaffInput, Staff } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { keepsASuperAdmin, STAFF_ROLE_VI } from "../domain/staff-rules.js";
import { audit, guarded, resolveStaffSession, toAuditEntry, toStaff, type StaffActor } from "./_shared.js";
import type { AdminDeps } from "./ports.js";

/**
 * Phiên hiện tại có quyền quản trị không, kèm trạng thái xác thực 2 lớp. Không phải quản trị viên → null
 * (không phải lỗi: app của khách gọi để biết có chuyển sang /admin).
 */
export async function getAdminSession(deps: AdminDeps, sessionToken: string): Promise<Result<AdminSession | null>> {
  const s = await resolveStaffSession(deps, sessionToken);
  if (!s.ok) return ok(null);
  const row = await deps.uow.run((r) => r.staff.get(s.value.actor.userId));
  return ok(row ? { staff: toStaff(row), mfa: s.value.mfa } : null);
}

export async function listStaff(deps: AdminDeps, actor: StaffActor): Promise<Result<Staff[]>> {
  return guarded(actor, "VIEW", () => deps.uow.run(async (r) => ok((await r.staff.list()).map(toStaff))));
}

/** Mời: tạo tài khoản (hoặc dùng tài khoản đã có) + dòng quản trị viên INVITED; kích hoạt ở lần đăng nhập đầu. */
export async function inviteStaff(deps: AdminDeps, actor: StaffActor, input: InviteStaffInput): Promise<Result<Staff>> {
  return guarded(actor, "STAFF", async () => {
    const account = await deps.identity.provisionAccount({ email: input.email, name: input.name });
    if (!account.ok) return account;
    return deps.uow.run(async (r) => {
      if (await r.staff.get(account.value.userId)) return err(domainError("DUPLICATE", "Email này đã là quản trị viên"));
      await r.staff.insert({ userId: account.value.userId, role: input.role, status: "INVITED", invitedBy: actor.userId, at: deps.clock.now() });
      const row = (await r.staff.get(account.value.userId))!;
      await audit(deps, r, actor, "STAFF_INVITED", { type: "STAFF", id: row.userId, label: row.name }, "Mời quản trị viên mới", `Vai trò ${STAFF_ROLE_VI[input.role]}`);
      return ok(toStaff(row));
    });
  });
}

export async function changeStaffRole(deps: AdminDeps, actor: StaffActor, id: string, input: ChangeStaffRoleInput): Promise<Result<Staff>> {
  return guarded(actor, "STAFF", () =>
    deps.uow.run(async (r) => {
      const s = await r.staff.get(id);
      if (!s) return err(domainError("NOT_FOUND", "Không tìm thấy quản trị viên"));
      if (s.userId === actor.userId) return err(domainError("FORBIDDEN", "Không tự đổi vai trò của chính mình"));
      if (s.role === input.role) return err(domainError("CONFLICT", "Quản trị viên đang giữ đúng vai trò này"));
      const keeps = keepsASuperAdmin(await r.staff.list(), s.userId, { role: input.role, status: s.status });
      if (!keeps.ok) return keeps;
      await r.staff.update(id, { role: input.role }, deps.clock.now());
      await audit(deps, r, actor, "STAFF_ROLE_CHANGED", { type: "STAFF", id, label: s.name }, input.reason, `${STAFF_ROLE_VI[s.role]} → ${STAFF_ROLE_VI[input.role]}`);
      return ok(toStaff({ ...s, role: input.role }));
    }),
  );
}

/** Khóa = đăng xuất ngay mọi phiên của tài khoản đó. */
export async function setStaffDisabled(deps: AdminDeps, actor: StaffActor, id: string, disabled: boolean, input: AdminReasonInput): Promise<Result<Staff>> {
  return guarded(actor, "STAFF", () =>
    deps.uow.run(async (r) => {
      const s = await r.staff.get(id);
      if (!s) return err(domainError("NOT_FOUND", "Không tìm thấy quản trị viên"));
      if (s.userId === actor.userId) return err(domainError("FORBIDDEN", "Không tự khóa tài khoản của chính mình"));
      if (s.status === "INVITED") return err(domainError("CONFLICT", "Tài khoản chưa kích hoạt nên không khóa/mở được"));
      if (disabled === (s.status === "DISABLED")) return err(domainError("CONFLICT", disabled ? "Tài khoản đã bị khóa" : "Tài khoản đang hoạt động"));
      const status = disabled ? ("DISABLED" as const) : ("ACTIVE" as const);
      if (disabled) {
        const keeps = keepsASuperAdmin(await r.staff.list(), s.userId, { role: s.role, status });
        if (!keeps.ok) return keeps;
        await r.sessions.deleteByUser(s.userId);
      }
      await r.staff.update(id, { status }, deps.clock.now());
      await audit(deps, r, actor, disabled ? "STAFF_DISABLED" : "STAFF_ENABLED", { type: "STAFF", id, label: s.name }, input.reason);
      return ok(toStaff({ ...s, status }));
    }),
  );
}

export async function listAudit(deps: AdminDeps, actor: StaffActor, filter: { orgId?: string } = {}): Promise<Result<AdminAuditEntry[]>> {
  return guarded(actor, "VIEW", () => deps.uow.run(async (r) => ok((await r.audit.list({ ...filter, limit: 500 })).map(toAuditEntry))));
}
