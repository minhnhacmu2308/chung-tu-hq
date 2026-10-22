import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Test component (*.test.tsx) chạy trong jsdom: khai báo `// @vitest-environment jsdom` đầu file.
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"], css: false },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
