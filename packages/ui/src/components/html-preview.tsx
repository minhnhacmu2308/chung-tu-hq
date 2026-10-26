// Xem trước một trang HTML đứng riêng (vd email đã dựng) trong iframe sandbox: không chạy script, không đọc được trang chứa.
// `device` đổi bề rộng khung để xem như trên máy tính / điện thoại.
import { cn } from "../lib/cn.js";

export type HtmlPreviewProps = {
  html: string;
  /** Tên khung cho trình đọc màn hình (vd "Xem trước email"). */
  title: string;
  device?: "desktop" | "mobile";
  className?: string;
};

export function HtmlPreview({ html, title, device = "desktop", className }: HtmlPreviewProps) {
  return (
    <div data-slot="html-preview" className={cn("flex justify-center overflow-hidden rounded-md border border-border bg-surface-muted", className)}>
      <iframe
        title={title}
        srcDoc={html}
        // Chỉ hiển thị: không script, không form, không mở cửa sổ. Liên kết trong email mở tab mới (allow-popups) để thử link.
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className={cn("h-full min-h-120 w-full bg-surface", device === "mobile" && "max-w-sm border-x border-border")}
      />
    </div>
  );
}
