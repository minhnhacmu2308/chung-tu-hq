// Gợi ý ngắn khi rê/focus. Không đặt thao tác (nút, link) bên trong tooltip.
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** Đặt một lần ở gốc app (hoặc mỗi Tooltip tự bọc nếu thiếu). */
export function TooltipProvider({ children, delay = 300 }: { children: ReactNode; delay?: number }) {
  return <TooltipPrimitive.Provider delayDuration={delay}>{children}</TooltipPrimitive.Provider>;
}

export type TooltipProps = {
  content: ReactNode;
  /** Phần tử kích hoạt – phải focus được (button, link). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
  className?: string;
};

export function Tooltip({ content, children, side = "top", delay = 300, className }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn("z-[70] max-w-xs rounded-md bg-fg px-2.5 py-1.5 text-xs text-bg shadow-md motion-safe:animate-fade-in", className)}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-fg" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
