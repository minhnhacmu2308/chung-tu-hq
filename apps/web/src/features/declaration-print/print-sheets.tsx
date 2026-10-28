"use client";
// Các trang giấy của bản in: đầu trang lặp ở mọi trang, trang chung theo `pages`, rồi khối dòng hàng (`< 01 >`…) theo `itemsPerPage` khối mỗi trang.
// Vùng dạng cặp = hai cột như mẫu (PaperColumns – đo theo bề rộng trang giấy, khi in luôn hai cột).
import { Grid, PaperColumns, PaperLabel, PaperSheet, PaperStack } from "@kb/ui";
import { expandPrintRow, printLayoutFor, type PrintCell as Cell, type PrintRegion, type PrintRepeatRow, type PrintRow } from "@kb/contracts";
import { Fragment, type ReactNode } from "react";
import { PrintCell, type CellLook } from "./print-cell";
import { pageCount, type PrintTarget } from "./print-state";

type Kind = "IDA" | "EDA";
type Region = PrintRegion | [PrintRegion, PrintRegion];

/** id DOM của một vùng trang chung (vd "print-chi-thi") – để cuộn tới. */
export const regionDomId = (id: string) => `print-${id}`;
/** id DOM của trang giấy thứ `page` (1-based) – thanh công cụ cuộn tới. */
export const pageDomId = (page: number) => `print-page-${page}`;

type Props = {
  kind: Kind;
  title: { title: string; watermark: string | null };
  /** Số dòng hàng (`lineNo`) theo thứ tự dòng – in `< 01 >` theo số dòng thật, không theo vị trí mảng. */
  lineNos: number[];
  look: (key: string, line?: number) => CellLook;
  selected: PrintTarget | null;
  /** Phải ổn định (useCallback) để ô không vẽ lại khi chọn ô khác. */
  onSelect: (key: string, line?: number) => void;
  /** Ô không vẽ (vd ô Hải quan trả về khi Hải quan chưa trả kết quả); vùng / nhóm lặp không còn ô nào thì ẩn cả tiêu đề. */
  hidden?: ((key: string, line?: number) => boolean) | undefined;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export function PrintSheets({ kind, title, lineNos, look, selected, onSelect, hidden }: Props) {
  const layout = printLayoutFor(kind);
  const lines = lineNos.length;
  const total = pageCount(kind, lines);

  // Nhãn trống của dòng lặp = khoảng trắng không ngắt: mọi ô cùng chiều cao với ô đầu (nhãn "1") trên màn hình.
  const NBSP = String.fromCharCode(160);
  const headerOnce = (row: PrintRepeatRow) => row.count > 1 && row.cells.reduce((n, c) => n + (c.span ?? 12), 0) <= 12;

  const shows = (row: PrintRow, line: number | undefined) => !hidden || expandPrintRow(row).flat().some((c) => !hidden(c.key, line));
  const showsRegion = (rg: PrintRegion, line: number | undefined) => rg.rows.some((row) => shows(row, line));

  // inRepeat: ô của nhóm lặp vẽ đủ cả nhóm (nhãn cột in một lần phải khớp ô) – nhóm ẩn hay hiện cả nhóm; ô dòng thường ẩn riêng.
  const printCell = (cell: Cell, line: number | undefined, interactive: boolean, label = cell.label, inRepeat = false) => {
    if (!inRepeat && hidden?.(cell.key, line)) return null;
    const l = look(cell.key, line);
    return (
      <PrintCell
        key={cell.key}
        kind={kind}
        cellKey={cell.key}
        label={label}
        span={cell.span}
        align={cell.align}
        line={line}
        raw={l.raw}
        state={l.state}
        compareTo={l.compareTo}
        selected={selected?.key === cell.key && selected.line === line}
        onSelect={interactive ? onSelect : undefined}
      />
    );
  };

  /**
   * Các ô của một danh sách dòng in, đặt thẳng vào lưới 12 cột. `interactive` = false → ô chỉ đọc (đầu trang lặp).
   * Nhóm lặp nhiều dòng mà mỗi lần lặp nằm gọn một hàng lưới (như mẫu: vận đơn, sắc thuế, khoản điều chỉnh…): nhãn cột in một lần,
   * mỗi dòng chỉ số thứ tự (nhãn của ô đầu) + giá trị. Lần lặp nhiều hàng lưới ("Thuế và thu khác") giữ nhãn từng ô như mẫu.
   */
  const rows = (list: PrintRow[], line: number | undefined, interactive = true): ReactNode =>
    list.map((row, r) => !shows(row, line) ? null : (
      <Fragment key={r}>
        {!Array.isArray(row) && row.label && <p data-paper-heading className="col-span-12 px-1.5 pt-1 text-xs font-semibold">{row.label}</p>}
        {!Array.isArray(row) && headerOnce(row) ? (
          <>
            {row.cells.map((c, i) => <PaperLabel key={`h${i}`} span={c.span ?? 12} {...(c.align ? { align: c.align } : {})}>{c.label}</PaperLabel>)}
            {expandPrintRow(row).map((cells, i) => cells.map((cell, j) => printCell(cell, line, interactive, j === 0 ? String(i + 1) : NBSP, true)))}
          </>
        ) : !Array.isArray(row) && row.count > 1 ? (
          // Lần lặp nhiều hàng lưới: nhãn từng ô như mẫu, số thứ tự trước nhãn ô đầu ("1 Tên").
          // Ô ẩn được bỏ riêng (mỗi ô có nhãn); số thứ tự đặt trước nhãn ô đầu còn hiện.
          expandPrintRow(row).map((cells, i) => cells.filter((c) => !hidden?.(c.key, line)).map((cell, j) => printCell(cell, line, interactive, j === 0 ? `${i + 1} ${cell.label}` : cell.label, true)))
        ) : (
          expandPrintRow(row).flat().map((cell) => printCell(cell, line, interactive))
        )}
      </Fragment>
    ));

  const region = (rg: PrintRegion, line: number | undefined) => (
    <div key={rg.id} id={line === undefined ? regionDomId(rg.id) : undefined} className="min-w-0 pt-1 print:pt-0.5">
      {rg.title && <h3 data-paper-heading className="px-1.5 py-1 text-xs font-semibold">{rg.title}</h3>}
      {rg.rows.length > 0 && <Grid cols={12} gap="none">{rows(rg.rows, line)}</Grid>}
    </div>
  );

  const regions = (list: Region[], line: number | undefined) =>
    list.map((pair) => {
      // Vùng cặp còn một bên có ô → vẽ bên đó như vùng đơn.
      const rg: Region | null = !Array.isArray(pair) ? (showsRegion(pair, line) ? pair : null)
        : showsRegion(pair[0], line) && showsRegion(pair[1], line) ? pair
        : showsRegion(pair[0], line) ? pair[0] : showsRegion(pair[1], line) ? pair[1] : null;
      if (!rg) return null;
      return Array.isArray(rg) ? (
        <PaperColumns key={`${rg[0].id}|${rg[1].id}`}>
          {region(rg[0], line)}
          {region(rg[1], line)}
        </PaperColumns>
      ) : (
        <div key={rg.id} className="col-span-12 min-w-0">{region(rg, line)}</div>
      );
    });

  // Đầu trang lặp: bản ở trang 1 bấm được; từ trang 2 chỉ đọc và aria-hidden (vẫn hiện, vẫn in) – trình đọc màn hình không nghe lại N lần.
  const header = (page: number) => (
    <div className="flex flex-col gap-1" aria-hidden={page > 1 ? true : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p data-paper-title className="text-sm font-bold uppercase print:flex-1 print:text-center print:text-base print:normal-case">{title.title}</p>
        <p className="font-mono text-xs">{page} / {total}</p>
      </div>
      <Grid cols={12} gap="none">{rows(layout.header, undefined, page === 1)}</Grid>
    </div>
  );

  const itemPages = Array.from({ length: Math.ceil(lines / layout.itemsPerPage) }, (_, p) =>
    Array.from({ length: Math.min(layout.itemsPerPage, lines - p * layout.itemsPerPage) }, (_, j) => p * layout.itemsPerPage + j),
  );

  return (
    <PaperStack>
      {layout.pages.map((pg, i) => (
        <PaperSheet key={pg.id} id={pageDomId(i + 1)} page={i + 1} total={total} header={header(i + 1)} watermark={title.watermark}>
          {regions(pg.regions, undefined)}
        </PaperSheet>
      ))}
      {itemPages.map((block, p) => {
        const page = layout.pages.length + p + 1;
        return (
          <PaperSheet key={page} id={pageDomId(page)} page={page} total={total} header={header(page)} watermark={title.watermark}>
            {block.map((line) => (
              <Fragment key={line}>
                <p data-paper-item className="col-span-12 pt-2 font-mono text-sm font-semibold">{`< ${pad2(lineNos[line] ?? line + 1)} >`}</p>
                {regions(layout.item, line)}
              </Fragment>
            ))}
          </PaperSheet>
        );
      })}
    </PaperStack>
  );
}
