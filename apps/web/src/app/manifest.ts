// Web app manifest: cho Chrome/Edge/Safari cài KhaiBáo AI thành ứng dụng máy tính (PWA).
import type { MetadataRoute } from "next";
import { VI_TITLES } from "./app-titles.messages";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: VI_TITLES.brand,
    short_name: VI_TITLES.brand,
    description: VI_TITLES.description,
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    // kb-allow-raw: manifest chỉ nhận mã màu cố định – dùng đúng màu primary và nền sáng của token
    theme_color: "#0F6B55",
    // kb-allow-raw: như trên – màu nền màn chờ khi mở ứng dụng
    background_color: "#FFFFFF",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
