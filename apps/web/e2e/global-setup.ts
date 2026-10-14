// Đăng nhập một lần qua API cho mỗi tài khoản và lưu cookie (storageState) → tránh chạm giới hạn đăng nhập khi chạy nhiều lần.
import { request, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const STATE_DIR = path.join(here, ".auth");
export const stateFor = (user: "chau" | "tuan") => path.join(STATE_DIR, `${user}.json`);

export default async function globalSetup(config: FullConfig) {
  const baseURL = (config.projects[0]?.use.baseURL as string | undefined) ?? "http://localhost:3100";
  mkdirSync(STATE_DIR, { recursive: true });
  for (const [user, email] of [["chau", "chau.le@anphat-demo.vn"], ["tuan", "tuan.pham@anphat-demo.vn"]] as const) {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post("/api/auth/login", { data: { email, password: "demo1234" } });
    if (!res.ok()) throw new Error(`Đăng nhập e2e thất bại cho ${email}: ${res.status()} ${await res.text()}`);
    await ctx.storageState({ path: stateFor(user) });
    await ctx.dispose();
  }
}
