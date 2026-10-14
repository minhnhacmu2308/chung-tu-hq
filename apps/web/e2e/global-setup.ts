// Đăng nhập một lần qua API cho mỗi tài khoản và lưu cookie (storageState) → tránh chạm giới hạn đăng nhập khi chạy nhiều lần.
// Tài khoản quản trị (bao) qua luôn bước xác thực 2 lớp: lần đầu thiết lập và lưu khóa vào .auth/bao-totp.txt (gitignored), các lần sau nhập mã.
import { request, type APIRequestContext, type FullConfig } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { totpCode } from "./totp";

const here = path.dirname(fileURLToPath(import.meta.url));
export const STATE_DIR = path.join(here, ".auth");
export const stateFor = (user: "chau" | "tuan" | "bao") => path.join(STATE_DIR, `${user}.json`);
export const totpFileFor = (user: string) => path.join(STATE_DIR, `${user}-totp.txt`);

/** Qua bước 2FA cho phiên của `ctx`. Mã đã dùng ở bước 30 giây này (lần chạy trước) bị từ chối → thử mã của bước kế tiếp. */
async function passMfa(ctx: APIRequestContext, user: string) {
  const { session } = (await (await ctx.get("/api/admin/session")).json()) as { session: { mfa?: { enrolled: boolean; verified: boolean } } | null };
  if (!session?.mfa || session.mfa.verified) return;
  if (!session.mfa.enrolled) {
    const setup = (await (await ctx.post("/api/admin/mfa/setup", { data: {} })).json()) as { secret: string };
    writeFileSync(totpFileFor(user), setup.secret);
    const res = await ctx.post("/api/admin/mfa/confirm", { data: { code: totpCode(setup.secret) } });
    if (!res.ok()) throw new Error(`Bật 2FA e2e thất bại cho ${user}: ${res.status()} ${await res.text()}`);
    return;
  }
  if (!existsSync(totpFileFor(user))) throw new Error(`${user} đã bật 2FA nhưng thiếu ${totpFileFor(user)} – nhờ Quản trị cấp cao khác đặt lại 2FA cho tài khoản này.`);
  const secret = readFileSync(totpFileFor(user), "utf8").trim();
  for (const offset of [0, 1]) {
    const res = await ctx.post("/api/admin/mfa/verify", { data: { code: totpCode(secret, offset) } });
    if (res.ok()) return;
  }
  throw new Error(`Nhập mã 2FA e2e thất bại cho ${user}`);
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = (config.projects[0]?.use.baseURL as string | undefined) ?? "http://localhost:3100";
  mkdirSync(STATE_DIR, { recursive: true });
  for (const [user, email] of [["chau", "chau.le@anphat-demo.vn"], ["tuan", "tuan.pham@anphat-demo.vn"], ["bao", "bao.hoang@khaibao-demo.vn"]] as const) {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post("/api/auth/login", { data: { email, password: "demo1234" } });
    if (!res.ok()) throw new Error(`Đăng nhập e2e thất bại cho ${email}: ${res.status()} ${await res.text()}`);
    if (user === "bao") await passMfa(ctx, user);
    await ctx.storageState({ path: stateFor(user) });
    await ctx.dispose();
  }
}
