import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // `pnpm test` ở gốc chạy song song nhiều gói: test jsdom + axe (vd Combobox 100 option) vượt 5 s mặc định khi máy bận.
    testTimeout: 20_000,
  },
});
