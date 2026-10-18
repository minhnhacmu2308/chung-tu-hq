// Abbreviation: chữ viết tắt (gạch chân chấm) – bấm hoặc Enter mở khung tên đầy đủ. Dùng cho nhãn dài làm vỡ lưới form
// (vd "Mã PLHH" = Mã phân loại hàng hóa). Đặt được trong nhãn Field: là nút (nội dung tương tác) nên bấm vào không đẩy con trỏ vào ô nhập,
// tên truy cập gồm cả chữ viết tắt lẫn tên đầy đủ (chữ ẩn trong nút) để ô nhập vẫn có tên đọc đủ nghĩa.
import { cn } from "../lib/cn.js";
import { Popover, PopoverContent, PopoverTrigger } from "./menu.js";

export type AbbreviationProps = {
  /** Chữ hiện trên giao diện. */
  short: string;
  /** Tên đầy đủ hiện khi bấm. */
  full: string;
  className?: string;
};

export function Abbreviation({ short, full, className }: AbbreviationProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "cursor-help rounded-sm text-left underline decoration-fg-subtle decoration-dotted underline-offset-4 hover:decoration-fg",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            className,
          )}
        >
          {short}
          {/* Chữ ẩn: tên truy cập của nút (và của ô nhập khi nằm trong nhãn) gồm cả tên đầy đủ, vẫn bắt đầu bằng chữ nhìn thấy. */}
          <span className="sr-only"> ({full})</span>
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={`Viết tắt: ${short}`} className="w-auto max-w-xs px-3 py-2 text-sm" side="top" align="start">
        {full}
      </PopoverContent>
    </Popover>
  );
}
