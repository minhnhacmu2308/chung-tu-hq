// Quản trị viên hệ thống mẫu (khu /admin, ADR 0006) – trùng email với bản mock để demo giống nhau. Mật khẩu = DEMO_PASSWORD.
import type { Db } from "../client.js";
import { platformStaff, users } from "../schema/index.js";

export const DEMO_STAFF = [
  { id: "usr_stf_bao", name: "Hoàng Gia Bảo", email: "bao.hoang@khaibao-demo.vn", role: "SUPER_ADMIN" },
  { id: "usr_stf_trang", name: "Mai Thị Thu Trang", email: "trang.mai@khaibao-demo.vn", role: "SUPPORT" },
  { id: "usr_stf_viet", name: "Đinh Quốc Việt", email: "viet.dinh@khaibao-demo.vn", role: "READONLY" },
] as const;

export async function seedPlatformStaff(db: Db, opts: { passwordHash: string }) {
  for (const s of DEMO_STAFF) {
    await db.insert(users).values({ id: s.id, email: s.email, name: s.name, passwordHash: opts.passwordHash, emailVerifiedAt: new Date() }).onConflictDoNothing();
    await db.insert(platformStaff).values({ userId: s.id, role: s.role, status: "ACTIVE" }).onConflictDoNothing();
  }
}
