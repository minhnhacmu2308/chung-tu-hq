"use client";
// Lô > 50 dòng tách thành N tờ khai nhánh: thanh chọn tờ ở đầu bản in ("Tờ 1/3 · dòng 1–50") và ghi chú chỉ tiêu chung áp dụng cho cả N tờ.
// Lô 1 tờ: không hiện gì.
import { Alert, Badge, fill, SegmentedControl, useMessages } from "@kb/ui";
import { formatNumber } from "@/lib/format";
import type { SheetInfo } from "./print-state";
import { PRINT_MESSAGES } from "./print.messages";

/** `issues[k-1]` = số việc cần xử lý riêng của tờ k (sheetIssueCounts) – tờ có việc hiện huy hiệu số (kèm chữ cho trình đọc màn hình). */
type Props = { sheets: SheetInfo[]; value: number; onChange: (no: number) => void; issues?: number[] };

export function SheetPicker({ sheets, value, onChange, issues }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  if (sheets.length <= 1) return null;
  return (
    <SegmentedControl
      label={t.sheetPick}
      hideLabel
      className="justify-start"
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      options={sheets.map((s) => {
        const n = issues?.[s.no - 1] ?? 0;
        const text = fill(t.sheetOption, { no: formatNumber(s.no), of: formatNumber(s.of), from: formatNumber(s.lineFrom), to: formatNumber(s.lineTo) });
        return {
          value: String(s.no),
          label: n > 0 ? (
            <>
              {text}
              <Badge tone="warning">
                {formatNumber(n)}
                <span className="sr-only">{t.sheetIssues}</span>
              </Badge>
            </>
          ) : text,
        };
      })}
    />
  );
}

/** Ghi chú cạnh khối chỉ tiêu chung: giống nhau ở mọi tờ, sửa ở tờ nào cũng là sửa chung. */
export function SharedFieldsNote({ of }: { of: number }) {
  const t = useMessages(PRINT_MESSAGES);
  if (of <= 1) return null;
  return (
    <Alert tone="info" title={fill(t.sharedNote, { n: formatNumber(of) })}>
      {t.sharedNoteBody}
    </Alert>
  );
}
