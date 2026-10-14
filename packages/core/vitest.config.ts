import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000, // *.int.test.ts khởi động Postgres trong Docker
    hookTimeout: 120_000,
  },
});
