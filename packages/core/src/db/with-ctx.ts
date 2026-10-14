import { sql } from "drizzle-orm";
import type { OrgId, UserId } from "../shared/ids.js";
import type { Db, Tx } from "./client.js";

export type DbCtx = { orgId: OrgId; userId?: UserId };

/**
 * Mọi truy vấn nghiệp vụ chạy trong đây: transaction + đặt app.org_id / app.user_id để policy RLS lọc.
 * orgId rỗng là lỗi lập trình → ném ngay, không chạy truy vấn.
 */
export async function withCtx<T>(db: Db, ctx: DbCtx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (typeof ctx.orgId !== "string" || ctx.orgId.length === 0) throw new Error("withCtx: orgId bắt buộc");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${ctx.orgId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId ?? ""}, true)`);
    return fn(tx);
  });
}

/** Chỉ cho đăng nhập/đăng ký: đặt user, chưa có org. */
export async function withUser<T>(db: Db, userId: UserId, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("withUser: userId bắt buộc");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', '', true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * CHỈ module identity dùng cho đăng nhập/đăng ký/đặt lại mật khẩu: chưa có user lẫn org.
 * Policy của users/organizations mở đọc khi không có ngữ cảnh; mọi bảng nghiệp vụ khác vẫn bị chặn.
 */
export async function withSystem<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', '', true)`);
    await tx.execute(sql`select set_config('app.user_id', '', true)`);
    return fn(tx);
  });
}
