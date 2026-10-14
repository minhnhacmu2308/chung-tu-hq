import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";
import path from "node:path";

// Một file .env ở gốc repo dùng chung cho web, worker và script.
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

const config: NextConfig = {
  // @kb/ui xuất thẳng mã nguồn TypeScript → Next biên dịch cùng app.
  transpilePackages: ["@kb/ui", "@kb/contracts", "@kb/core"],
  // Thư viện hạ tầng chỉ chạy phía server, không đóng gói bằng webpack (bullmq có dep tùy chọn @valkey/valkey-glide).
  serverExternalPackages: ["bullmq", "ioredis", "postgres", "drizzle-orm", "@node-rs/argon2", "nodemailer"],
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  webpack(cfg) {
    // @kb/ui viết import kiểu NodeNext ("./color.js" trỏ tới color.ts). Turbopack chưa hỗ trợ ánh xạ này → dùng webpack (cờ --webpack).
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
};

export default config;
