"use client";
// Các trang giấy của bản in: đầu trang lặp ở mọi trang, trang chung theo `pages`, rồi khối dòng hàng (`< 01 >`…) theo `itemsPerPage` khối mỗi trang.
// Vùng dạng cặp = hai cột như mẫu (PaperColumns – đo theo bề rộng trang giấy, khi in luôn hai cột).
import { Grid, PaperColumns, PaperSheet, PaperStack } from "@kb/ui";
import { expandPrintRow, printLayoutFor, type PrintRegion, type PrintRow } from "@kb/contracts";
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
  /** Số dòng hàng. */
  lines: number;
  look: (key: string, line?: number) => CellLook;
  selected: PrintTarget | null;
  /** Phải ổn định (useCallback) để ô không vẽ lại khi chọn ô khác. */
  onSelect: (key: string, line?: number) => void;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export function PrintSheets({ kind, title, lines, look, selected, onSelect }: Props) {
  const layout = printLayoutFor(kind);
  const total = pageCount(kind, lines);

  /** Các ô của một danh sách dòng in, đặt thẳng vào lưới 12 cột. `interactive` = false → ô chỉ đọc (đầu trang lặp). */
  const rows = (list: PrintRow[], line: number | undefined, interactive = true): ReactNode =>
    list.map((row, r) => (
      <Fragment key={r}>
        {!Array.isArray(row) && row.label && <p className="col-span-12 px-1.5 pt-1 text-xs font-semibold">{row.label}</p>}
        {expandPrintRow(row).flat().map((cell) => {
          const l = look(cell.key, line);
          return (
            <PrintCell
              key={cell.key}
              kind={kind}
              cellKey={cell.key}
              label={cell.label}
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
        })}
      </Fragment>
    ));

  const region = (rg: PrintRegion, line: number | undefined) => (
    <div key={rg.id} id={line === undefined ? regionDomId(rg.id) : undefined} className="min-w-0 pt-1">
      {rg.title && <h3 className="px-1.5 py-1 text-xs font-semibold">{rg.title}</h3>}
      {rg.rows.length > 0 && <Grid cols={12} gap="none">{rows(rg.rows, line)}</Grid>}
    </div>
  );

  const regions = (list: Region[], line: number | undefined) =>
    list.map((rg) =>
      Array.isArray(rg) ? (
        <PaperColumns key={`${rg[0].id}|${rg[1].id}`}>
          {region(rg[0], line)}
          {region(rg[1], line)}
        </PaperColumns>
      ) : (
        <div key={rg.id} className="col-span-12 min-w-0">{region(rg, line)}</div>
      ),
    );

  // Đầu trang lặp: bản ở trang 1 bấm được; từ trang 2 chỉ đọc và aria-hidden (vẫn hiện, vẫn in) – trình đọc màn hình không nghe lại N lần.
  const header = (page: number) => (
    <div className="flex flex-col gap-1" aria-hidden={page > 1 ? true : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold uppercase">{title.title}</p>
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
                <p className="col-span-12 pt-2 font-mono text-sm font-semibold">{`< ${pad2(line + 1)} >`}</p>
                {regions(layout.item, line)}
              </Fragment>
            ))}
          </PaperSheet>
        );
      })}
    </PaperStack>
  );
}
