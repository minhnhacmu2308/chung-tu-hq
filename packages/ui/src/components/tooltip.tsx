// Gợi ý ngắn khi rê/focus. Không đặt thao tác (nút, link) bên trong tooltip.
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** Có Provider chung ở gốc: Tooltip không tự bọc Provider riêng (để "rê sang tooltip kế bên hiện ngay" chạy được). */
const HasProvider = createContext(false);

/**
 * Đặt một lần ở gốc app (hoặc mỗi Tooltip tự bọc nếu thiếu). Tooltip đầu tiên chờ `delay`; rê sang tooltip khác trong
 * `skipDelay` ms thì hiện ngay, không mờ dần (thanh công cụ, sidebar thu gọn, cụm icon trên dòng).
 */
export function TooltipProvider({ children, delay = 400, skipDelay = 300 }: { children: ReactNode; delay?: number; skipDelay?: number }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delay} skipDelayDuration={skipDelay}>
      <HasProvider.Provider value>{children}</HasProvider.Provider>
    </TooltipPrimitive.Provider>
  );
}

export type TooltipProps = {
  content: ReactNode;
  /** Phần tử kích hoạt – phải focus được (button, link). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
  className?: string;
};

export function Tooltip({ content, children, side = "top", delay, className }: TooltipProps) {
  const shared = useContext(HasProvider);
  const root = (
      <TooltipPrimitive.Root {...(delay !== undefined ? { delayDuration: delay } : {})}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn("z-[70] max-w-xs rounded-md bg-fg px-2.5 py-1.5 text-xs text-bg shadow-md motion-safe:animate-fade-in motion-safe:data-[state=closed]:animate-fade-out data-[state=instant-open]:animate-none", className)}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-fg" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
  );
  return shared ? root : <TooltipPrimitive.Provider delayDuration={delay ?? 300}>{root}</TooltipPrimitive.Provider>;
}
