import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";
import path from "node:path";

// Một file .env ở gốc repo dùng chung cho web, worker và script.
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

/**
 * Header bảo mật cho mọi phản hồi. Chưa đặt Content-Security-Policy: Next chèn script inline và app nhúng PDF/ảnh từ storage
 * ký sẵn (S3/Azure), cần liệt kê nguồn theo môi trường – làm riêng kèm chế độ report-only.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Chỉ có tác dụng khi phục vụ qua HTTPS; trình duyệt bỏ qua trên HTTP (dev).
  ...(process.env.APP_URL?.startsWith("https") ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const config: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
