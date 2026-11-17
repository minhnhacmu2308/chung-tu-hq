import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Test component (*.test.tsx) chạy trong jsdom: khai báo `// @vitest-environment jsdom` đầu file.
  esbuild: { jsx: "automatic" },
  // Test render cả trang (jsdom) chậm khi máy bận (CI 4 vCPU, chạy song song nhiều file) → mặc định 5s của vitest
  // làm test rơi ngẫu nhiên vì hết giờ dù kết quả đúng. 60s cho mỗi test/hook; test vẫn kết thúc ngay khi xong.
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"], css: false, testTimeout: 60_000, hookTimeout: 60_000 },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
