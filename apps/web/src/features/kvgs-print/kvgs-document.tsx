"use client";
// Bản kê mã vạch qua khu vực giám sát (spec KVGS §4) theo đúng 2 mẫu Hải quan: đầu trang (chi cục khu vực, hải quan cửa khẩu, ngày),
// tiêu đề, "Tờ khai (không) phải niêm phong", mục 1–9, bảng, "Ghi chú" nguyên văn, "Kết xuất dữ liệu lúc". Chữ cố định: kvgs-print.vi.ts.
// Dữ liệu in nguyên văn như Hải quan trả (không đổi chữ hoa/dấu). Màu: token giấy (paper) + `scheme-light` – trang giấy luôn
// chữ đen nền trắng kể cả khi app ở chế độ tối (khi in: @media print của @kb/ui ép đen/trắng), mã quét được.
// Cột (5) mẫu container: ảnh mã PNG Hải quan cấp (barcodeImage, in nguyên ảnh – không tự dựng QR); thiếu ảnh → ô trống.
// Mẫu hàng lẻ: Code128 của số tờ khai (sheet.barcode) góc phải trên.
import type { KvgsSheet } from "@kb/contracts";
import { Barcode, fill, PaperSheet, PaperStack } from "@kb/ui";
import { formatDate } from "@/lib/format";
import { paginateWithNotes, type KvgsPage } from "./paginate";
import * as V from "./kvgs-print.vi";

export type KvgsTemplate = "cont" | "le";
type Container = KvgsSheet["containers"][number];

const pad = (n: number) => String(n).padStart(2, "0");
const localYmd = (t: Date) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;

/** "Ngày 24 tháng 10 năm 2026" theo giờ máy người in. */
export function dateLine(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return fill(V.DATE_LINE, { d: pad(t.getDate()), m: pad(t.getMonth() + 1), y: t.getFullYear() });
}

/** Thời điểm UTC → "24/10/2026 11:00 PM" (giờ máy người in, như mẫu). */
export function exportedAtText(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const h = t.getHours();
  return `${formatDate(localYmd(t), "vi")} ${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(t.getMinutes())} ${h < 12 ? V.AM : V.PM}`;
}

const declarationDates = (s: KvgsSheet) =>
  s.declarationDateTo ? `${formatDate(s.declarationDate, "vi")} - ${formatDate(s.declarationDateTo, "vi")}` : formatDate(s.declarationDate, "vi");

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? "col-span-full" : undefined}>
      <span className="font-bold">{label}</span> <span>{value}</span>
    </p>
  );
}

function Head({ sheet, template }: { sheet: KvgsSheet; template: KvgsTemplate }) {
  const code = template === "le" ? sheet.barcode : null;
  return (
    <div className="flex flex-col gap-3">
      {/* Không đủ chỗ cạnh tên cơ quan (mã vạch dài) → khối mã vạch + ngày xuống dòng dưới, vẫn căn phải; không bao giờ vượt bề rộng in. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col items-center text-center font-bold">
          <p>{sheet.regionOffice}</p>
          <p>{sheet.customsOffice}</p>
        </div>
        <div className="ml-auto flex max-w-full flex-col items-end gap-1">
          {code && (
            // Code128 không bao giờ bị nén: rộng hơn trang (màn hẹp) thì cuộn ngang, khi in luôn đủ chỗ (A4 ~190mm).
            <div className="max-w-full overflow-x-auto print:overflow-visible">
              <Barcode type="code128" size="sm" value={code} label={fill(V.BARCODE_LABEL.declaration, { no: sheet.declarationNo })} />
            </div>
          )}
          <p className="italic">{dateLine(sheet.exportedAt)}</p>
        </div>
      </div>
      <h2 data-paper-title className="flex flex-col items-center gap-1 text-center text-lg font-bold">
        <span>{V.TITLE[template]}</span>
        <span>{V.SUBTITLE}</span>
        <span className="text-base">{sheet.sealRequired ? V.SEAL.required : V.SEAL.notRequired}</span>
      </h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm paper-wide:grid-cols-2 print:grid-cols-2">
        <Item wide label={V.ITEMS.supervisionOffice} value={sheet.supervisionOffice} />
        <Item wide label={V.ITEMS.company} value={sheet.companyName} />
        <Item label={V.ITEMS.taxCode} value={sheet.taxCode} />
        <Item label={V.ITEMS.declarationDate} value={declarationDates(sheet)} />
        <Item label={V.ITEMS.declarationNo} value={sheet.declarationNo} />
        <Item label={V.ITEMS.typeName} value={sheet.typeName} />
        <Item label={V.ITEMS.declarationStatus} value={sheet.declarationStatus} />
        <Item label={V.ITEMS.channel} value={sheet.channel} />
        <Item wide label={V.ITEMS.cargoControlNo} value={sheet.cargoControlNo} />
      </div>
    </div>
  );
}

const TH = "border border-paper-rule px-1 py-1 text-center align-middle font-bold";
const TD = "border border-paper-rule px-1 py-1 align-middle";

function HeadCell({ lines, className }: { lines: readonly string[]; className?: string }) {
  return (
    <th scope="col" className={className ? `${TH} ${className}` : TH}>
      {lines.map((l) => <span key={l} className="block">{l}</span>)}
    </th>
  );
}

function ContainerTable({ rows, start }: { rows: Container[]; start: number }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      {/* kb-allow-raw: bảng của văn bản in A4 theo mẫu Hải quan – cần <thead> lặp mỗi trang giấy và ô trống để công chức ký; DataTable là bảng tương tác trên màn hình */}
      <table className="w-full border-collapse text-xs paper-wide:text-sm print:text-sm">
        <thead className="table-header-group">
          <tr>
            <HeadCell lines={[V.STT]} className="w-10" />
            <HeadCell lines={V.CONT_COLUMNS.containerNo} />
            <HeadCell lines={V.CONT_COLUMNS.sealNo} />
            <HeadCell lines={V.CONT_COLUMNS.customsSealNo} />
            <HeadCell lines={V.CONT_COLUMNS.officer} />
            <HeadCell lines={V.CONT_COLUMNS.barcode} className="w-28" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={`${c.containerNo}-${start + i}`} className="break-inside-avoid">
              <td className={`${TD} text-right`}>{start + i + 1}</td>
              <td className={`${TD} break-all`}>{c.containerNo}</td>
              <td className={`${TD} break-all`}>{c.sealNo ?? ""}</td>
              <td className={`${TD} break-all`}>{c.customsSealNo ?? ""}</td>
              <td className={TD} />
              <td className={`${TD} text-center`}>
                <Barcode type="png" size="sm" value={c.barcodeImage ?? ""} label={fill(V.BARCODE_LABEL.container, { no: c.containerNo })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CargoTable({ cargo }: { cargo: KvgsSheet["cargo"] }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      {/* kb-allow-raw: bảng của văn bản in A4 theo mẫu Hải quan – cột (3), (4) để trống cho công chức ghi tay, ký nhiều lần; DataTable là bảng tương tác trên màn hình */}
      <table className="w-full border-collapse text-xs paper-wide:text-sm print:text-sm">
        <thead className="table-header-group">
          <tr>
            <HeadCell lines={[V.STT]} className="w-10" />
            <HeadCell lines={V.CARGO_COLUMNS.quantity} />
            <HeadCell lines={V.CARGO_COLUMNS.weight} />
            <HeadCell lines={V.CARGO_COLUMNS.actual} />
            <HeadCell lines={V.CARGO_COLUMNS.officer} />
          </tr>
        </thead>
        <tbody>
          <tr className="break-inside-avoid">
            <td className={`${TD} h-44 text-right align-top`}>1</td>
            <td className={`${TD} align-top`}>{cargo ? `${cargo.quantity} ${cargo.quantityUnit}` : ""}</td>
            <td className={`${TD} align-top`}>{cargo ? `${cargo.grossWeight} ${cargo.weightUnit}` : ""}</td>
            <td className={TD} />
            <td className={TD} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Notes({ sheet, template }: { sheet: KvgsSheet; template: KvgsTemplate }) {
  const lines = template === "cont" ? V.CONT_NOTES : V.CARGO_NOTES;
  return (
    <div className="flex flex-col gap-3 text-xs paper-wide:text-sm print:text-sm">
      <div className="flex flex-col gap-0.5">
        <p className={template === "le" ? "italic underline" : undefined}>{V.NOTE_TITLE}</p>
        {lines.map((l) => <p key={l.text} className={l.level === 1 ? "pl-4" : undefined}>{l.text}</p>)}
      </div>
      <p className="border-t border-paper-rule pt-2">{fill(V.EXPORTED_AT, { at: exportedAtText(sheet.exportedAt) })}</p>
    </div>
  );
}

/** Bản kê theo mẫu `template` (cont: bảng container + ảnh mã Hải quan cấp mỗi dòng, sang trang; le: một dòng hàng + Code128 đầu trang). */
export function KvgsDocument({ sheet, template }: { sheet: KvgsSheet; template: KvgsTemplate }) {
  // Số dòng mỗi trang (chừa chỗ cho Ghi chú ở trang cuối): KVGS_PAGE_LIMITS trong paginate.ts. Mẫu hàng lẻ: một trang.
  const pages: KvgsPage<Container>[] = template === "cont" ? paginateWithNotes(sheet.containers) : [{ rows: [], notes: true }];
  const starts = pages.map((_, i) => pages.slice(0, i).reduce((n, p) => n + p.rows.length, 0));
  return (
    <PaperStack className="scheme-light">
      {pages.map((page, i) => {
        const first = starts[i] ?? 0;
        // Trang chỉ có ghi chú (dòng cuối không còn chỗ cho ghi chú) → không in lại bảng rỗng.
        const table = template === "le" || i === 0 || page.rows.length > 0;
        return (
          <PaperSheet key={i} page={i + 1} total={pages.length}>
            <div className="col-span-12 flex flex-col gap-3 text-sm">
              {i === 0 && <Head sheet={sheet} template={template} />}
              {table && (template === "cont" ? <ContainerTable rows={page.rows} start={first} /> : <CargoTable cargo={sheet.cargo} />)}
              {page.notes && <Notes sheet={sheet} template={template} />}
              <p className="text-right text-xs">{fill(V.PAGE, { n: i + 1, total: pages.length })}</p>
            </div>
          </PaperSheet>
        );
      })}
    </PaperStack>
  );
}
