import { useEffect, useRef, useState } from "react";
import { intlLocale, useUiLocale } from "../lib/i18n.js";

export type CountUpProps = {
  /** Số ĐẾM nguyên (số hồ sơ, số trường…). KHÔNG dùng cho tiền/trị giá – tiền là Decimal, hiển thị nguyên văn. */
  value: number;
  /** Thời gian chạy (ms). */
  duration?: number;
  className?: string;
};

const canAnimate = () =>
  typeof window !== "undefined" &&
  typeof window.requestAnimationFrame === "function" &&
  typeof window.matchMedia === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Số đếm chạy từ giá trị cũ (lần đầu: từ 0) lên giá trị mới. Trình đọc màn hình luôn nhận giá trị cuối;
 * không chạy khi người dùng bật giảm chuyển động.
 */
export function CountUp({ value, duration = 700, className }: CountUpProps) {
  const locale = intlLocale(useUiLocale());
  const [shown, setShown] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (!canAnimate() || start === value) {
      setShown(value);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setShown(start);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  const format = (n: number) => n.toLocaleString(locale);
  return (
    <span className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
