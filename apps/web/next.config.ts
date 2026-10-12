import type { NextConfig } from "next";

const config: NextConfig = {
  // @kb/ui xuất thẳng mã nguồn TypeScript → Next biên dịch cùng app.
  transpilePackages: ["@kb/ui"],
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  webpack(cfg) {
    // @kb/ui viết import kiểu NodeNext ("./color.js" trỏ tới color.ts). Turbopack chưa hỗ trợ ánh xạ này → dùng webpack (cờ --webpack).
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
};

export default config;
