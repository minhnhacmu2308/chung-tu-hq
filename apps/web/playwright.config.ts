import { defineConfig } from "@playwright/test";
import { stateFor } from "./e2e/global-setup";

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
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", channel: "chrome", headless: true, viewport: { width: 1440, height: 900 }, locale: "vi-VN", storageState: stateFor("chau") },
});
