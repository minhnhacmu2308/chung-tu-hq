"use client";
// Một ô trên bản in tờ khai: nhãn in đúng chữ của mẫu, giá trị theo danh mục / định dạng (printValue), trạng thái ô (lỗi, thiếu, ước tính, đã sửa).
// Số chỉ tiêu không in trên trang – chỉ ở tooltip (và panel, Task 7) và trong tên trợ năng.
// memo + props nguyên thủy + onSelect ổn định từ nơi gọi: chọn một ô chỉ vẽ lại ô cũ và ô mới, không vẽ lại mọi tooltip.
// Bật "Sửa nhanh tại ô" (InlineEditContext): gõ trên ô đang chọn → nhập ngay trong ô; F2 sửa giá trị đang có; Delete / Backspace xóa ô;
// Enter / nhấp đúp → panel đầy đủ. Ô không nhập tại chỗ được (mã HS, ô dồn, ô bị khóa…) → gõ cũng mở panel. Giá trị chưa lưu hiện ngay trên ô.
import { PaperField, Tooltip, fill, useMessages, type PaperFieldState } from "@kb/ui";
import { memo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { fieldTitle } from "../declaration-form/display";
import { CODE_TABLES, codeListFor, type PrintCell as Cell } from "@kb/contracts";
import { useCodeList, useCodeName } from "../declaration-form/use-code-list";
import { FORM_MESSAGES } from "../declaration-form/form.messages";
import { inlineInputOf, parseInline, type InlineInput } from "./inline-edit";
import { useCellDraft, useCellEditing, useCellRejected, useInlineEdit, type InlineEditApi } from "./inline-edit-store";
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

/** Phím gõ chữ (bắt đầu nhập tại chỗ): một ký tự in được, không kèm Ctrl / ⌘ / Alt. Dấu cách giữ hành vi nút (chọn ô). */
const typedChar = (e: KeyboardEvent) => e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey && !e.nativeEvent.isComposing;

export const PrintCell = memo(function PrintCell({ kind, cellKey, label, span = 12, align, line, raw: savedRaw, state, compareTo, selected, onSelect, className }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  const inline = useInlineEdit();
  const id = cellDomId(cellKey, line);
  const draft = useCellDraft(inline, id);
  const editing = useCellEditing(inline, id);
  // Mã vừa gõ sai bị bỏ: ô báo đỏ (như lỗi) kèm câu nhắc trong tooltip / tên trợ năng, tới khi nhập lại.
  const rejected = useCellRejected(inline, id);
  const raw = draft ?? savedRaw;
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
  const rejectedText = rejected !== undefined ? fill(t.quickRejected, { v: rejected }) : null;
  const ariaLabel = `${no ? `${no} ` : ""}${name}:${blank ? t.blank : ""}${rejectedText ? ` ${rejectedText}` : ""}`;
  const input = inline && onSelect ? inlineInputOf(kind, cellKey) : null;

  if (inline && editing !== undefined && input) {
    return (
      <InlineCellEditor
        api={inline}
        cellKey={cellKey}
        line={line}
        input={input}
        codeTable={spot?.field.codeTable}
        initial={editing}
        label={label}
        ariaLabel={`${no ? `${no} ` : ""}${name}`}
        span={span}
        align={align}
        className={className}
      />
    );
  }

  // Tooltip: tên chỉ tiêu (+ giá trị khi ô hẹp chỉ in mã); sửa nhanh: ô có danh mục nhắc nhấp đúp mở danh mục, ô vừa nhập mã sai nhắc nhập lại.
  const base = narrowCode ? `${fieldTitle(no, name)}: ${value}` : fieldTitle(no, name);
  const tip = [base, rejectedText, inline && onSelect && spot?.field.codeTable ? t.quickDblCode : null].filter(Boolean).join(" · ");

  // Sửa nhanh: phím trên ô đang chọn. Ô nhập tại chỗ được → gõ / F2 / Delete; còn lại → panel.
  const quickKeys = inline && onSelect
    ? {
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
          const editable = inline.canEdit(cellKey, line);
          if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            inline.openPanel(cellKey, line);
          } else if (e.key === "F2") {
            e.preventDefault();
            if (editable) inline.start(cellKey, line, null);
            else inline.openPanel(cellKey, line);
          } else if ((e.key === "Delete" || e.key === "Backspace") && editable) {
            e.preventDefault();
            inline.clearCell(cellKey, line);
          } else if (typedChar(e)) {
            e.preventDefault();
            if (editable) inline.start(cellKey, line, e.key);
            else inline.openPanel(cellKey, line);
          }
        },
        onDoubleClick: (e: MouseEvent<HTMLElement>) => {
          e.preventDefault();
          inline.openPanel(cellKey, line);
        },
      }
    : {};

  return (
    <Tooltip content={tip}>
      <PaperField
        label={label}
        value={shown}
        {...(!narrowCode && code !== null && code !== value ? { compact: code } : {})}
        keepTogether={keep}
        state={rejectedText ? "error" : state}
        compareTo={draft === undefined ? compareTo : null}
        selected={selected}
        pending={draft !== undefined}
        {...(onSelect ? { onSelect: () => onSelect(cellKey, line), "data-print-cell": id } : {})}
        {...quickKeys}
        ariaLabel={ariaLabel}
        span={span}
        {...(align ? { align } : {})}
        {...(className ? { className } : {})}
      />
    </Tooltip>
  );
});

type EditorProps = {
  api: InlineEditApi;
  cellKey: string;
  line: number | undefined;
  input: InlineInput;
  codeTable: Parameters<typeof useCodeName>[0];
  /** Chữ đặt sẵn: ký tự vừa gõ, hoặc giá trị đang có (F2 – nơi gọi đã đổi sang dạng nhập, vd ngày dd/mm/yyyy). */
  initial: string;
  label: string;
  ariaLabel: string;
  span: NonNullable<Cell["span"]>;
  align: Cell["align"] | undefined;
  className: string | undefined;
};

/** Ô nhập tại chỗ: chữ đang gõ giữ trong ô (không vẽ lại trang); Enter / Tab / mất focus → chốt, Esc → hủy. */
function InlineCellEditor({ api, cellKey, line, input, codeTable, initial, label, ariaLabel, span, align, className }: EditorProps) {
  const t = useMessages(PRINT_MESSAGES);
  const tf = useMessages(FORM_MESSAGES);
  const [text, setText] = useState(initial);
  const [bad, setBad] = useState(false);
  const parsed = parseInline(input, text);
  // Ô mã: tên theo mã đang gõ (cả danh mục VNACCS lớn – tải khi cần). Mã phải có trong danh mục: không có → báo đỏ, không chốt
  // (Enter / Tab ở lại ô); rời ô bằng chuột → bỏ giá trị, ô báo đỏ tới khi nhập lại. Danh mục đang tải → chờ (chưa chốt).
  const listId = input === "code" ? codeListFor(codeTable) : undefined;
  const list = useCodeList(listId);
  const codeName = useCodeName(input === "code" ? codeTable : undefined, parsed.ok ? parsed.value : "", null);
  const codeState: "ok" | "loading" | "unknown" =
    input !== "code" || !text.trim() || codeName ? "ok"
    : listId !== undefined ? (list === null ? "loading" : "unknown")
    : codeTable && CODE_TABLES[codeTable] ? "unknown"
    : "ok"; // không có danh mục để đối chiếu → không chặn
  const invalid = bad && (!parsed.ok || codeState !== "ok");
  const hint = invalid
    ? (input === "date" ? t.quickBadDate : input === "number" ? t.quickBadNumber : codeState === "loading" ? t.quickCodeLoading : t.quickCodeInvalid)
    : input === "code" && text.trim()
      ? codeName ?? (codeState === "unknown" ? t.quickCodeUnknown : t.quickHint)
      : input === "date"
        ? t.quickHintDate
        : input === "number" && parsed.ok && parsed.value && parsed.value !== text.trim()
          ? fill(t.quickHintNumber, { v: parsed.value })
          : t.quickHint;
  const commit = (move: -1 | 0 | 1) => {
    if (codeState !== "ok") {
      setBad(true);
      return false;
    }
    const ok = api.commit(cellKey, line, text, move);
    if (!ok) setBad(true);
    return ok;
  };
  return (
    <PaperField
      label={label}
      value={null}
      ariaLabel={ariaLabel}
      span={span}
      {...(align ? { align } : {})}
      {...(className ? { className } : {})}
      edit={{
        value: text,
        onChange: (v) => { setText(v); setBad(false); },
        invalid,
        hint,
        placeholder: input === "code" ? tf.codePlaceholder : input === "number" ? tf.enterNumber : input === "date" ? t.quickDatePlaceholder : tf.enterShort,
        inputMode: input === "number" ? "decimal" : "text",
        onKeyDown: (e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            commit(0);
          } else if (e.key === "Tab") {
            e.preventDefault();
            commit(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            api.cancel(cellKey, line);
          }
        },
        // Bấm ra chỗ khác: chốt nếu hợp lệ; mã không có trong danh mục → bỏ giá trị, ô báo đỏ; giá trị sai khác → bỏ phần đang gõ.
        onBlur: () => {
          if (!api.store.isEditing(cellDomId(cellKey, line))) return;
          if (codeState === "unknown") api.reject(cellKey, line, text.trim());
          else if (codeState !== "ok" || !api.commit(cellKey, line, text, 0)) api.cancel(cellKey, line);
        },
      }}
    />
  );
}
