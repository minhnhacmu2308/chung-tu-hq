import type { ComponentProps } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

const MESSAGES = {
  vi: { name: "KhaiBáo AI" },
  en: { name: "KhaiBáo AI" },
} satisfies Messages<"name">;

// Hình gốc: docs/brand/khaibao-symbol.svg (lưới 256). Sửa logo → sửa file gốc rồi chép path sang đây.
const SHEET = "M68 48h60l68 68v96a20 20 0 0 1-20 20H68a20 20 0 0 1-20-20V68a20 20 0 0 1 20-20z";
// Hai dòng chỉ tiêu của tờ khai – lỗ thật (evenodd) trên tờ giấy.
const FIELDS = "M80 136v24h84v-24zM80 180v24h52v-24z";
// Bản cỡ nhỏ: dòng chỉ tiêu cao hơn để không bít khi logo ≤ 24 px.
const FIELDS_SMALL = "M76 124v32h92v-32zM76 172v32h56v-32z";
// Góc giấy tách ra thành mũi tên hướng lên-phải: tờ khai được truyền đi.
const CORNER = "M156 28h64a8 8 0 0 1 8 8v64z";

export type BrandMarkProps = Omit<ComponentProps<"svg">, "children"> & {
  /** Dùng bản vẽ đơn giản hơn cho cỡ nhỏ (≤ 24 px): ô logo ở sidebar, favicon. */
  small?: boolean;
  /** Đứng cạnh tên sản phẩm viết bằng chữ → đặt `decorative` để trình đọc màn hình không đọc lặp. */
  decorative?: boolean;
  labels?: Partial<Record<"name", string>>;
};

/**
 * Ký hiệu KhaiBáo AI: tờ khai với các dòng chỉ tiêu, góc giấy tách ra thành mũi tên – tạo tờ khai và truyền tới Hải quan.
 * Vẽ bằng `currentColor` – đặt màu bằng class chữ (`text-primary`, `text-primary-fg`…), kích thước bằng `h-* w-*`.
 */
export function BrandMark({ small = false, decorative = false, labels, className, ...props }: BrandMarkProps) {
  const t = useMessages(MESSAGES, labels);
  return (
    <svg
      viewBox="32 24 212 212"
      fill="currentColor"
      className={cn("h-6 w-6 shrink-0", className)}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": t.name })}
      {...props}
    >
      <path fillRule="evenodd" d={SHEET + (small ? FIELDS_SMALL : FIELDS)} />
      <path d={CORNER} />
    </svg>
  );
}
