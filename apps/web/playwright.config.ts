import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stateFor } from "./e2e/global-setup";

// Node x64 trên máy Apple Silicon (Rosetta) làm Chrome chạy giả lập, chậm hàng chục lần → ép Chrome native qua e2e/chrome-native.sh.
const translated = process.platform === "darwin" && process.arch === "x64" && /Apple/.test(os.cpus()[0]?.model ?? "");
const browser = translated ? { launchOptions: { executablePath: path.join(path.dirname(fileURLToPath(import.meta.url)), "e2e/chrome-native.sh") } } : { channel: "chrome" as const };

/**
 * E2E trên bản build http (AI_PROVIDER=fake, CUSTOMS_GATEWAY=fake), server đã chạy ở cổng 3100:
 *   NEXT_DIST_DIR=.next-build NEXT_PUBLIC_DATA_SOURCE=http pnpm build && NEXT_DIST_DIR=.next-build pnpm start  (+ worker)
 * Dùng Chrome cài sẵn (channel) vì máy không tải browser Playwright.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", ...browser, headless: true, viewport: { width: 1440, height: 900 }, locale: "vi-VN", storageState: stateFor("chau") },
});
