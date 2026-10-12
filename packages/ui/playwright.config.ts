// Test chụp ảnh so sánh giao diện (visual regression) trên playground.
//   pnpm --filter @kb/ui test:visual            → so với ảnh chuẩn
//   pnpm --filter @kb/ui test:visual:update     → cập nhật ảnh chuẩn (chỉ khi thay đổi giao diện là CỐ Ý; xem ảnh diff trước)
import { defineConfig, devices } from "@playwright/test";

const PORT = 5181;

export default defineConfig({
  testDir: "./visual",
  // Ảnh chuẩn tách theo hệ điều hành: font render khác nhau giữa Windows/macOS/Linux (CI).
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never", outputFolder: "visual-report" }]],
  expect: {
    // Ngưỡng 0: hai lần chạy cùng máy cho ảnh giống hệt; ngưỡng lớn hơn sẽ bỏ lọt thay đổi nhỏ của token (đã thử: đổi bo góc 2px lọt qua ngưỡng 0,2%).
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 0 },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Máy dev dùng Chrome đã cài; CI cài chromium bằng `npx playwright install chromium`.
    ...(process.env.CI ? {} : { channel: "chrome" }),
    reducedMotion: "reduce",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx vite --config playground/vite.config.ts --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
