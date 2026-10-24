"use client";
// Một ô trên bản in tờ khai: nhãn in đúng chữ của mẫu, giá trị theo danh mục / định dạng (printValue), trạng thái ô (lỗi, thiếu, ước tính, đã sửa).
// Số chỉ tiêu không in trên trang – chỉ ở tooltip (và panel, Task 7) và trong tên trợ năng.
// memo + props nguyên thủy + onSelect ổn định từ nơi gọi: chọn một ô chỉ vẽ lại ô cũ và ô mới, không vẽ lại mọi tooltip.
import { PaperField, Tooltip, useMessages, type PaperFieldState } from "@kb/ui";
import type { PrintCell as Cell } from "@kb/contracts";
import { memo } from "react";
import { fieldTitle } from "../declaration-form/display";
import { fieldLocator, keepTogetherValue, NOT_ISSUED, printCode, printValue } from "./print-state";
import { PRINT_MESSAGES } from "./print.messages";

/** Giá trị `data-print-cell` của ô bấm được (chỉ số dòng hàng 0-based + khóa) – để cuộn tới ô ("Chỉ ô cần xử lý"). */
export const cellDomId = (key: string, line?: number) => `${line ?? ""}:${key}`;

/** Giá trị thô + trạng thái của một ô (tính ở print-declaration). */
export type CellLook = { raw: string; state: PaperFieldState; compareTo: string | null };

type Props = {
  kind: "IDA" | "EDA";
  cellKey: string;
  /** Chữ in trên mẫu ("" khi mẫu không in nhãn). */
  label: string;
  span?: Cell["span"] | undefined;
  align?: Cell["align"] | undefined;
  /** Chỉ số dòng hàng (0-based) khi ô thuộc dòng hàng. */
  line?: number | undefined;
  raw: string;
  state: PaperFieldState;
  compareTo: string | null;
  selected: boolean;
  /** Không truyền → ô chỉ đọc, không bấm được (vd đầu trang lặp từ trang 2). */
  onSelect?: ((key: string, line?: number) => void) | undefined;
  /** Lớp bố cục thêm (vd số cột theo bề rộng vùng nội dung). */
  className?: string | undefined;
};

export const PrintCell = memo(function PrintCell({ kind, cellKey, label, span = 12, align, line, raw, state, compareTo, selected, onSelect, className }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  const spot = fieldLocator(kind).get(cellKey);
  const no = spot ? spot.field.no ?? spot.parentNo : undefined;
  // Ô của nhóm lặp nhiều dòng: tên kèm số dòng ("Số vận đơn 2") – bản in chỉ in nhãn cột một lần, mỗi dòng in số thứ tự.
  const name = `${spot?.field.label ?? label}${spot?.repeatRow && (spot.repeatCount ?? 0) > 1 ? ` ${spot.repeatRow}` : ""}`;
  const value = printValue(spot?.field, raw);
  // Ô mã (bảng mã, lựa chọn, "mã · nghĩa"): trang giấy đủ rộng hiện "mã  tên"; trang hẹp và bản in chỉ mã như mẫu VNACCS.
  // Ô hẹp (≤ 2 cột) chỉ mã ở mọi bề rộng. Tên vẫn có ở tooltip và panel.
  const code = printCode(spot?.field, raw);
  const narrowCode = code !== null && span <= 2;
  const shown = narrowCode ? code : value;
  // Không bẻ giữa cụm: ngày, giờ, mã, số định danh (chỉ xuống dòng sau dấu phân cách – PaperField keepTogether).
  const keep = code !== null || keepTogetherValue(shown, spot?.field.input);
  // PaperField đọc tên này trước giá trị và dấu trạng thái → "1.6 Mã phương thức vận chuyển: 2 …"; rỗng → "…: trống".
  const blank = !raw.trim() && value !== NOT_ISSUED;
  const ariaLabel = `${no ? `${no} ` : ""}${name}:${blank ? t.blank : ""}`;
  return (
    <Tooltip content={narrowCode ? `${fieldTitle(no, name)}: ${value}` : fieldTitle(no, name)}>
      <PaperField
        label={label}
        value={shown}
        {...(!narrowCode && code !== null && code !== value ? { compact: code } : {})}
        keepTogether={keep}
        state={state}
        compareTo={compareTo}
        selected={selected}
        {...(onSelect ? { onSelect: () => onSelect(cellKey, line), "data-print-cell": cellDomId(cellKey, line) } : {})}
        ariaLabel={ariaLabel}
        span={span}
        {...(align ? { align } : {})}
        {...(className ? { className } : {})}
      />
    </Tooltip>
  );
});
