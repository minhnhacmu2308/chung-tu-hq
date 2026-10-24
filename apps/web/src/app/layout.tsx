import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Geist, Inter, JetBrains_Mono, Roboto } from "next/font/google";
import type { ReactNode } from "react";
import { VI_TITLES } from "./app-titles.messages";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: VI_TITLES.brand, template: VI_TITLES.template },
  description: VI_TITLES.description,
  applicationName: VI_TITLES.brand,
  // Safari (macOS "Thêm vào Dock", iOS "Thêm vào MH chính") – manifest đã khai cho Chrome/Edge.
  appleWebApp: { capable: true, title: VI_TITLES.brand, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // kb-allow-raw: màu thanh tiêu đề cửa sổ ứng dụng phải là mã màu cố định – đúng màu primary của token
  themeColor: "#0F6B55",
};

// next/font bắt buộc tham số là hằng viết trực tiếp (không dùng biến chung).
// Webfont cho tùy chọn "Font chữ" của @kb/ui: biến --kb-webfont-* được tokens.css đọc. Chỉ font mặc định được preload.
const beVietnamPro = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--kb-webfont-be-vietnam-pro", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], variable: "--kb-webfont-mono", display: "swap", preload: false });
const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--kb-webfont-inter", display: "swap", preload: false });
const roboto = Roboto({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "700"], variable: "--kb-webfont-roboto", display: "swap", preload: false });
// Geist trên Google Fonts chưa có bộ ký tự tiếng Việt đầy đủ: chữ có dấu thiếu sẽ rơi về font hệ thống.
const geist = Geist({ subsets: ["latin"], variable: "--kb-webfont-geist", display: "swap", preload: false });
const FONT_VARIABLES = [beVietnamPro, mono, inter, roboto, geist].map((f) => f.variable).join(" ");

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={FONT_VARIABLES} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
