import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

const MESSAGES = { vi: { loading: "Đang tải" }, en: { loading: "Loading" }, zh: { loading: "加载中" } } satisfies Messages<"loading">;

const spinnerVariants = cva("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", {
  variants: { size: { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" } },
  defaultVariants: { size: "md" },
});

export type SpinnerProps = VariantProps<typeof spinnerVariants> & {
  className?: string;
  /** Chữ cho trình đọc màn hình. `null` khi spinner nằm trong phần tử đã có trạng thái (vd Button loading). */
  label?: string | null;
};

export function Spinner({ size, className, label }: SpinnerProps) {
  const t = useMessages(MESSAGES);
  if (label === null) {
    return <span aria-hidden="true" className={cn(spinnerVariants({ size }), className)} />;
  }
  return (
    <span role="status" className="inline-flex items-center">
      <span aria-hidden="true" className={cn(spinnerVariants({ size }), className)} />
      <span className="sr-only">{label ?? t.loading}</span>
    </span>
  );
}
