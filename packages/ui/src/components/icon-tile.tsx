import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import type { Tone } from "./feedback.js";

const tileVariants = cva("inline-flex shrink-0 items-center justify-center rounded-md", {
  variants: {
    size: { sm: "h-8 w-8 [&>svg]:h-4 [&>svg]:w-4", md: "h-9 w-9 [&>svg]:h-4.5 [&>svg]:w-4.5", lg: "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5" },
    tone: {
      neutral: "bg-neutral-subtle text-neutral-subtle-fg",
      primary: "bg-primary-subtle text-primary-subtle-fg",
      success: "bg-success-subtle text-success-subtle-fg",
      warning: "bg-warning-subtle text-warning-subtle-fg",
      danger: "bg-danger-subtle text-danger-subtle-fg",
      info: "bg-info-subtle text-info-subtle-fg",
    },
  },
  defaultVariants: { size: "lg", tone: "primary" },
});

export type IconTileProps = {
  icon: ReactNode;
  tone?: Tone;
  /** sm 32px (dòng danh sách dày) · md 36px (dòng danh sách) · lg 40px (đầu thẻ, KPI). */
  size?: "sm" | "md" | "lg";
  className?: string;
};

/**
 * Ô vuông nền dịu chứa icon – đứng đầu thẻ, đầu dòng danh sách, trong StatCard. Chỉ để trang trí (aria-hidden):
 * nghĩa phải nằm ở chữ bên cạnh. Không tự ghép `span` + `bg-*-subtle` trong app.
 */
export function IconTile({ icon, tone, size, className }: IconTileProps) {
  return (
    <span aria-hidden="true" className={cn(tileVariants({ size, tone }), className)}>
      {icon}
    </span>
  );
}
