import type { AdminUser } from "@kb/contracts";

export type UserAction = "disable" | "enable" | "reset" | "verify" | "revoke";

/** Thao tác nào áp dụng được cho tài khoản ở trạng thái hiện tại (thứ tự = thứ tự hiển thị, thao tác chặn đứng cuối). */
export function availableUserActions(u: Pick<AdminUser, "status" | "emailVerified" | "sessions">): UserAction[] {
  const out: UserAction[] = [];
  if (u.status === "ACTIVE") out.push("reset");
  if (!u.emailVerified) out.push("verify");
  if (u.sessions.length > 0) out.push("revoke");
  if (u.status === "ACTIVE") out.push("disable");
  if (u.status === "DISABLED") out.push("enable");
  return out;
}
