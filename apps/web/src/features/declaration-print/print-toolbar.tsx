"use client";
// Thanh công cụ của bản in tờ khai: nhảy trang (1…N, "Chỉ tiêu khác"), "Chỉ ô cần xử lý (n)" (lần lượt ô lỗi → ô còn thiếu, cuộn tới + mở panel),
// "In / Lưu PDF" (window.print – quy tắc in chỉ giữ trang giấy). Nhiều trang (nhiều dòng hàng) → chọn trang bằng danh sách thả xuống.
import { Button, Select, Stack } from "@kb/ui";
import { CircleCheck, ListChecks, Printer } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { pageDomId } from "./print-sheets";

/** Quá số trang này → chọn trang bằng danh sách thả xuống thay cho từng nút. */
const MAX_PAGE_BUTTONS = 8;

type Props = {
  pages: number;
  /** id DOM của khối "Chỉ tiêu khác"; null = không có khối. */
  otherFieldsId: string | null;
  attentionCount: number;
  onNextAttention: () => void;
};

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function PrintToolbar({ pages, otherFieldsId, attentionCount, onNextAttention }: Props) {
  const list = Array.from({ length: pages }, (_, i) => i + 1);
  return (
    <Stack direction="row" gap="sm" align="center" wrap justify="between" role="toolbar" aria-label="Bản in tờ khai">
      <Stack direction="row" gap="xs" align="center" wrap>
        {pages > MAX_PAGE_BUTTONS ? (
          <Select
            aria-label="Đi tới trang"
            className="w-40"
            placeholder="Đi tới trang…"
            value=""
            options={list.map((p) => ({ value: String(p), label: `Trang ${formatNumber(p)} / ${formatNumber(pages)}` }))}
            onChange={(e) => e.currentTarget.value && scrollToId(pageDomId(Number(e.currentTarget.value)))}
          />
        ) : (
          list.map((p) => (
            <Button key={p} size="sm" variant="ghost" aria-label={`Trang ${p}`} onClick={() => scrollToId(pageDomId(p))}>
              {p}
            </Button>
          ))
        )}
        {otherFieldsId && (
          <Button size="sm" variant="ghost" onClick={() => scrollToId(otherFieldsId)}>
            Chỉ tiêu khác
          </Button>
        )}
      </Stack>
      <Stack direction="row" gap="xs" align="center" wrap>
        <Button
          size="sm"
          variant={attentionCount > 0 ? "primary" : "secondary"}
          leftIcon={attentionCount > 0 ? <ListChecks className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
          disabled={attentionCount === 0}
          onClick={onNextAttention}
        >
          {attentionCount > 0 ? `Chỉ ô cần xử lý (${formatNumber(attentionCount)})` : "Không còn ô cần xử lý"}
        </Button>
        <Button size="sm" variant="secondary" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          In / Lưu PDF
        </Button>
      </Stack>
    </Stack>
  );
}
