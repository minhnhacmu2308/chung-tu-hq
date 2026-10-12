import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Cho tailwind-merge biết tên token của ta để gộp class đúng (vd text-fg-muted vs text-sm).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "bg", "surface", "surface-muted", "border", "border-strong", "fg", "fg-muted", "fg-subtle", "overlay",
        "primary", "primary-hover", "primary-active", "primary-fg", "primary-subtle", "primary-subtle-fg", "focus",
        ...["success", "warning", "danger", "info", "neutral"].flatMap((t) => [t, `${t}-fg`, `${t}-subtle`, `${t}-subtle-fg`]),
      ],
      radius: ["sm", "md", "lg", "full"],
      shadow: ["sm", "md", "lg"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
