"use client";
// Một ô trên bản in tờ khai: nhãn in đúng chữ của mẫu, giá trị theo danh mục / định dạng (printValue), trạng thái ô (lỗi, thiếu, ước tính, đã sửa).
// Số chỉ tiêu không in trên trang – chỉ ở tooltip (và panel, Task 7) và trong tên trợ năng.
import { cn, PaperField, Tooltip, type PaperFieldState } from "@kb/ui";
import type { PrintCell as Cell } from "@kb/contracts";
import { fieldTitle } from "../declaration-form/display";
import { fieldLocator, printValue } from "./print-state";

/** Class tĩnh để Tailwind quét được. */
const SPAN = { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4", 6: "col-span-6", 12: "col-span-12" } as const;

/** Giá trị thô + trạng thái của một ô (tính ở print-declaration). */
export type CellLook = { raw: string; state: PaperFieldState; compareTo: string | null };

type Props = {
  kind: "IDA" | "EDA";
  cell: Cell;
  look: CellLook;
  selected?: boolean;
  /** Không truyền → ô chỉ đọc, không bấm được (vd đầu trang lặp từ trang 2). */
  onSelect?: (() => void) | undefined;
  /** true: không chiếm cột trên lưới 12 cột của trang (ô nằm trong lưới riêng, vd "Chỉ tiêu khác"). */
  free?: boolean;
};

export function PrintCell({ kind, cell, look, selected = false, onSelect, free = false }: Props) {
  const spot = fieldLocator(kind).get(cell.key);
  const no = spot ? spot.field.no ?? spot.parentNo : undefined;
  const name = spot?.field.label ?? cell.label;
  const value = printValue(spot?.field, look.raw);
  // PaperField đọc tên này trước giá trị và dấu trạng thái → "1.6 Mã phương thức vận chuyển: 2 …"; rỗng → "…: trống".
  const ariaLabel = `${no ? `${no} ` : ""}${name}:${look.raw.trim() ? "" : " trống"}`;
  return (
    <Tooltip content={fieldTitle(no, name)}>
      {/* Khung giữ cột trên lưới trang và làm đích tooltip (PaperField không nhận ref); lưới 12 cột để ô (span 12) giãn đầy khung cả chiều cao. */}
      <div className={cn("grid min-w-0 grid-cols-12", !free && SPAN[cell.span ?? 12])}>
        <PaperField
          label={cell.label}
          value={value}
          state={look.state}
          compareTo={look.compareTo}
          selected={selected}
          {...(onSelect ? { onSelect } : {})}
          ariaLabel={ariaLabel}
          span={12}
        />
      </div>
    </Tooltip>
  );
}
