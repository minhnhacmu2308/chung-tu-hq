import { resolveStaff, type StaffActor } from "@kb/core/modules/admin";
import { cookies } from "next/headers";
import { getContainer } from "@/container";
import { SESSION_COOKIE } from "./cookies";
import { DomainHttpError } from "./route";

/** Cookie phiên chung với ứng dụng → quản trị viên hệ thống. Không đăng nhập → 401; không có quyền quản trị → 403. */
export async function requireStaff(): Promise<StaffActor> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const r = await resolveStaff(getContainer().admin, token);
  if (!r.ok) throw new DomainHttpError(r.error);
  return r.value;
}

export async function sessionToken(): Promise<string> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? "";
}
