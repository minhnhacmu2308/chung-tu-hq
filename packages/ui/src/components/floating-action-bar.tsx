"use client";
// Thanh hành động nổi giữa đáy màn hình (cùng dáng thanh "đã chọn N dòng" của DataTable): tóm tắt bên trái + các nút bên phải.
// Dùng khi có việc đang chờ trên cả trang (vd "3 ô chưa lưu · Hủy · Lưu") – không chiếm chỗ trong bố cục, không in ra giấy.
// Gắn vào <body> (portal) nên nằm trên mọi thứ của trang; popup mở sau nằm đè lên vì đứng sau trong DOM.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn.js";

export type FloatingActionBarProps = {
  /** Tên vùng cho trình đọc màn hình (role="toolbar"). */
  label: string;
  /** Chữ tóm tắt bên trái (vd "3 ô chưa lưu"); đọc như trạng thái khi đổi. */
  summary?: ReactNode;
  /** Các nút – nút chính đặt cuối (bên phải). */
  children: ReactNode;
  /**
   * "bottom" (mặc định): giữa đáy màn hình. "top": giữa đầu vùng nội dung, ngay dưới thanh menu (`--kb-shell-top`) – dùng khi trang đã có
   * thanh dính đáy (vd "Tổng thuế · Phê duyệt" của bước Review) để hai thanh không chồng nhau.
   */
  placement?: "bottom" | "top";
};

export function FloatingActionBar({ label, summary, children, placement = "bottom" }: FloatingActionBarProps) {
  // Portal chỉ sau khi gắn vào trang (không có document khi dựng ở máy chủ).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      role="toolbar"
      aria-label={label}
      data-slot="floating-action-bar"
      data-placement={placement}
      className={cn(
        "fixed left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface py-2 pl-4 pr-2 text-fg shadow-lg print:hidden",
        placement === "top" ? "top-[calc(var(--kb-shell-top)+0.75rem)] motion-safe:animate-fade-in" : "bottom-6 motion-safe:animate-slide-up",
      )}
    >
      {summary != null && (
        <>
          <span role="status" className="text-sm font-medium tabular-nums">{summary}</span>
          <span aria-hidden="true" className="h-5 w-px bg-border" />
        </>
      )}
      {children}
    </div>,
    document.body,
  );
}
