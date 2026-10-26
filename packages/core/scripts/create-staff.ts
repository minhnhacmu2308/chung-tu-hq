// Tạo quản trị viên hệ thống (khu /admin) bằng mật khẩu tạm – dùng cho tài khoản quản trị ĐẦU TIÊN trên DB mới (chưa ai mời được ai),
// hoặc cấp lại mật khẩu tạm khi quản trị viên quên (--reset). Mật khẩu tạm in ra MỘT lần; đăng nhập lần đầu bị bắt đổi, sau đó thiết lập 2FA.
//
//   pnpm --filter @kb/core admin:create-staff --email admin@congty.vn --name "Nguyễn Văn A" [--role SUPER_ADMIN|SUPPORT|READONLY]
//   pnpm --filter @kb/core admin:create-staff --email admin@congty.vn --reset
// Production (image Docker): docker compose run --rm migrate node_modules/.bin/tsx scripts/create-staff.ts --email … --name …
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";
import { EmailSchema, StaffRoleSchema } from "@kb/contracts";
import { eq } from "drizzle-orm";
import { loadEnv } from "../src/config/env.js";
import { createDb } from "../src/db/client.js";
import { platformStaff, sessions, users } from "../src/db/schema/index.js";
import { generateTempPassword } from "../src/modules/identity/domain/password.js";
import { Argon2Hasher } from "../src/modules/identity/infrastructure/argon2-hasher.js";
import { ulidIdGen } from "../src/shared/ids.js";

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "SUPER_ADMIN" }, reset: { type: "boolean", default: false } },
});
const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const email = EmailSchema.safeParse(values.email ?? "");
if (!email.success) fail("Thiếu hoặc sai --email");
const role = StaffRoleSchema.safeParse(values.role);
if (!role.success) fail("--role phải là SUPER_ADMIN, SUPPORT hoặc READONLY");

const db = createDb(loadEnv().DATABASE_ADMIN_URL, { max: 1 });
try {
  const tempPassword = generateTempPassword(randomBytes);
  const passwordHash = await new Argon2Hasher().hash(tempPassword);
  const now = new Date();
  const user = (await db.select().from(users).where(eq(users.email, email.data!)).limit(1))[0];
  const staff = user ? (await db.select().from(platformStaff).where(eq(platformStaff.userId, user.id)).limit(1))[0] : undefined;

  if (values.reset) {
    if (!user || !staff) fail(`${email.data} chưa là quản trị viên – bỏ --reset để tạo mới`);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, mustChangePassword: true, updatedAt: now }).where(eq(users.id, user!.id));
      // Mật khẩu cũ không còn hiệu lực ở bất kỳ phiên nào.
      await tx.delete(sessions).where(eq(sessions.userId, user!.id));
    });
    console.log(`✓ Đã cấp lại mật khẩu tạm cho ${email.data}`);
  } else {
    if (user) fail(`${email.data} đã có tài khoản${staff ? " quản trị" : ""} – dùng email khác${staff ? " hoặc --reset để cấp lại mật khẩu tạm" : ""}`);
    if (!values.name || values.name.trim().length < 2) fail("Thiếu --name (họ tên)");
    const userId = ulidIdGen.next("usr");
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id: userId, email: email.data!, name: values.name!.trim(), passwordHash, emailVerifiedAt: now, mustChangePassword: true });
      await tx.insert(platformStaff).values({ userId, role: role.data!, status: "INVITED" });
    });
    console.log(`✓ Đã tạo quản trị viên ${email.data} (${role.data})`);
  }
  console.log(`  Mật khẩu tạm: ${tempPassword}`);
  console.log("  Đăng nhập lần đầu sẽ bị bắt đổi mật khẩu, sau đó thiết lập xác thực 2 lớp (ứng dụng TOTP).");
} finally {
  await db.close();
}
