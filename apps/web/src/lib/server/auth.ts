import { getSession } from "@kb/core/modules/identity";
import type { Session } from "@kb/contracts";
import type { Ctx } from "@kb/core/shared";
import { cookies } from "next/headers";
import { getContainer } from "@/container";
import { SESSION_COOKIE } from "./cookies";
import { HttpError } from "./route";

/** Đọc cookie phiên → Ctx (org, user, vai trò). Không có hoặc hết hạn → 401. */
export async function requireSession(): Promise<{ ctx: Ctx; session: Session; token: string }> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const r = await getSession(getContainer().identity, token);
  if (!r.ok) throw new HttpError(401, "UNAUTHENTICATED", "Chưa đăng nhập hoặc phiên đã hết hạn");
  return { ...r.value, token };
}
