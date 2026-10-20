"use client";
// Các trang giấy của bản in: đầu trang lặp ở mọi trang, trang chung theo `pages`, rồi khối dòng hàng (`< 01 >`…) theo `itemsPerPage` khối mỗi trang.
// Vùng dạng cặp = hai cột như mẫu, xếp một cột khi vùng nội dung hẹp (dưới cq-md).
import { Grid, PaperSheet, PaperStack } from "@kb/ui";
import { expandPrintRow, printLayoutFor, type PrintRegion, type PrintRow } from "@kb/contracts";
import { Fragment, type ReactNode } from "react";
import { PrintCell, type CellLook } from "./print-cell";
import { pageCount, type PrintTarget } from "./print-state";

type Kind = "IDA" | "EDA";
type Region = PrintRegion | [PrintRegion, PrintRegion];

/** id DOM của một vùng trang chung (vd "print-chi-thi") – để cuộn tới. */
export const regionDomId = (id: string) => `print-${id}`;

type Props = {
  kind: Kind;
  title: { title: string; watermark: string | null };
  /** Số dòng hàng. */
  lines: number;
  look: (key: string, line?: number) => CellLook;
  selected: PrintTarget | null;
  onSelect: (t: PrintTarget) => void;
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
        {expandPrintRow(row).flat().map((cell) => (
          <PrintCell
            key={cell.key}
            kind={kind}
            cell={cell}
            look={look(cell.key, line)}
            selected={selected?.key === cell.key && selected.line === line}
            onSelect={interactive ? () => onSelect(line === undefined ? { key: cell.key } : { key: cell.key, line }) : undefined}
          />
        ))}
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
        <Grid key={`${rg[0].id}|${rg[1].id}`} cols={{ base: 1, md: 2 }} gap="none" className="col-span-12">
          {region(rg[0], line)}
          {region(rg[1], line)}
        </Grid>
      ) : (
        <div key={rg.id} className="col-span-12 min-w-0">{region(rg, line)}</div>
      ),
    );

  const header = (page: number) => (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold uppercase">{title.title}</p>
        <p className="font-mono text-xs">{page} / {total}</p>
      </div>
      {/* Đầu trang lặp: chỉ bản ở trang 1 bấm được, các trang sau chỉ đọc (tránh trùng nút cho trình đọc màn hình). */}
      <Grid cols={12} gap="none">{rows(layout.header, undefined, page === 1)}</Grid>
    </div>
  );

  const itemPages = Array.from({ length: Math.ceil(lines / layout.itemsPerPage) }, (_, p) =>
    Array.from({ length: Math.min(layout.itemsPerPage, lines - p * layout.itemsPerPage) }, (_, j) => p * layout.itemsPerPage + j),
  );

  return (
    <PaperStack>
      {layout.pages.map((pg, i) => (
        <PaperSheet key={pg.id} id={`print-page-${i + 1}`} page={i + 1} total={total} header={header(i + 1)} watermark={title.watermark}>
          {regions(pg.regions, undefined)}
        </PaperSheet>
      ))}
      {itemPages.map((block, p) => {
        const page = layout.pages.length + p + 1;
        return (
          <PaperSheet key={page} id={`print-page-${page}`} page={page} total={total} header={header(page)} watermark={title.watermark}>
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
