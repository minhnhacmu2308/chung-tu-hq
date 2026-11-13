"use client";
// Bản in hóa đơn thương mại / Packing List theo MẪU DOANH NGHIỆP (ADR 0013 mục 3): ghép các nhóm thông tin chuẩn (UCP600 Đ18, ISBP 821 mục C)
// theo thứ tự, bật/tắt, nhãn trong `snapshot.layout` (chép lúc phát hành). In từ snapshot – không đối chiếu L/C.
// Nội dung chứng từ luôn tiếng Anh (DOC_LABELS); số/tiền theo dạng "en" (1,250.50) như thông lệ thương mại quốc tế.
import { amountInWords, type InvoiceBlockKey, type InvoiceColumnKey, type InvoiceLayout, type IssuedInvoice, type IssuedInvoiceSnapshot } from "@kb/contracts";
import { fill, PaperSheet } from "@kb/ui";
import type { ReactNode } from "react";
import { sumDecimal } from "@/lib/decimal";
import { formatMoney, formatNumber } from "@/lib/format";
import type { CopyKind } from "./copies";
import { BLOCK_LABELS, COLUMN_LABELS, DOC_LABELS as L } from "./invoice-document.labels";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const; // kb-allow-raw: tháng in trên chứng từ tiếng Anh
/** "2026-11-11" → "11 NOV 2026" – không nhầm ngày/tháng giữa các nước (khác dạng 11/11). */
export const docDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}` : iso;
};
const money = (v: string) => formatMoney(v, undefined, 2, "en");
const qty = (v: string) => formatNumber(v, (v.split(".")[1] ?? "").replace(/0+$/, "").length, "en");

/** "FOB HAIPHONG PORT, VIETNAM – INCOTERMS® 2020" (ISBP 821 mục C: điều kiện giao hàng kèm phiên bản khi có). */
export function termsLine(s: IssuedInvoiceSnapshot) {
  const base = [s.invoice.incoterm, s.invoice.incotermPlace].filter(Boolean).join(" ");
  const ver = s.layout.incotermsVersion;
  return base && ver ? `${base} – ${L.incoterms} ${ver}` : base;
}

/** Packing List: cùng mẫu nhưng bỏ nhóm/cột về tiền, thêm nhóm đóng gói. */
export function packingLayout(l: InvoiceLayout): InvoiceLayout {
  const off = new Set<InvoiceBlockKey>(["TERMS", "TOTALS", "LC_REF", "STATEMENT"]);
  return {
    ...l,
    title: L.packingTitle,
    blocks: l.blocks.map((b) => (off.has(b.key) ? { ...b, visible: false } : b.key === "PACKING" ? { ...b, visible: true } : b)),
    columns: l.columns.map((c) => (c.key === "UNIT_PRICE" || c.key === "AMOUNT" ? { ...c, visible: false } : c)),
  };
}

type Rows = [string, string | null | undefined][];
const filled = (rows: Rows) => rows.filter(([, v]) => !!v) as [string, string][];

function Section({ label, wide, children }: { label: string | null; wide: boolean; children: ReactNode }) {
  return (
    <section className={wide ? "col-span-12 py-2 text-sm" : "col-span-12 py-2 text-sm paper-wide:col-span-6 print:col-span-6"}>
      {label && <h3 className="mb-1 text-xs font-bold uppercase tracking-wide">{label}</h3>}
      {children}
    </section>
  );
}

function RowList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="flex flex-col gap-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="w-36 shrink-0 text-xs uppercase">{k}</dt>
          <dd className="min-w-0 break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ItemsTable({ s, columns }: { s: IssuedInvoiceSnapshot; columns: InvoiceLayout["columns"] }) {
  const cur = s.invoice.currency;
  const cols = columns.filter((c) => c.visible);
  const head = (k: InvoiceColumnKey, label: string | null) => fill(label ?? COLUMN_LABELS[k], { cur });
  const right = (k: InvoiceColumnKey) => k === "QUANTITY" || k === "UNIT_PRICE" || k === "AMOUNT";
  const unitCol = cols.some((c) => c.key === "UNIT");
  // Mã/ĐVT/lượng/đơn giá IN theo bộ mã của mẫu (ảnh chụp lúc phát hành); bản phát hành cũ chưa có → như dữ liệu dòng.
  const shown = (it: IssuedInvoiceSnapshot["items"][number]) => ({
    code: it.printedCode ?? it.partNo, unit: it.printedUnit ?? it.unit, quantity: it.printedQuantity ?? it.quantity, unitPrice: it.printedUnitPrice ?? it.unitPrice,
  });
  const cell = (row: IssuedInvoiceSnapshot["items"][number], k: InvoiceColumnKey): string => {
    const it = { ...row, ...shown(row) };
    switch (k) {
      case "LINE_NO": return String(it.lineNo);
      case "DESCRIPTION": return it.description;
      case "PART_NO": return it.code ?? "";
      case "HS_CODE": return it.hsCode ?? "";
      case "ORIGIN": return it.origin ?? "";
      case "QUANTITY": return unitCol ? qty(it.quantity) : `${qty(it.quantity)} ${it.unit}`;
      case "UNIT": return it.unit;
      case "UNIT_PRICE": return money(it.unitPrice);
      case "AMOUNT": return money(it.amount);
    }
  };
  const printed = s.items.map(shown);
  const units = [...new Set(printed.map((i) => i.unit))];
  const totalQty = units.map((u) => `${qty(sumDecimal(printed.filter((i) => i.unit === u).map((i) => i.quantity), 3).replace(/\.?0+$/, "") || "0")} ${u}`).join(" + ");
  const total = (k: InvoiceColumnKey, i: number) => (i === 0 ? L.total : k === "QUANTITY" ? totalQty : k === "AMOUNT" ? `${money(s.invoice.totalAmount)} ${cur}` : "");
  return (
    <div className="overflow-x-auto">
      {/* kb-allow-raw: bảng hàng của chứng từ in A4 – cần <thead> lặp ở mỗi trang giấy khi in, DataTable là bảng tương tác trên màn hình */}
      <table className="w-full border-collapse text-xs paper-wide:text-sm print:text-sm">
        <thead className="table-header-group">
          <tr className="border-y border-paper-rule text-left uppercase">
            {cols.map((c) => <th key={c.key} className={right(c.key) ? "px-1 py-1 text-right" : "px-1 py-1"}>{head(c.key, c.label)}</th>)}
          </tr>
        </thead>
        <tbody>
          {s.items.map((it) => (
            <tr key={it.lineNo} className="align-top">
              {cols.map((c) => (
                <td key={c.key} className={right(c.key) ? "whitespace-nowrap px-1 py-1 text-right" : c.key === "HS_CODE" ? "px-1 py-1 font-mono text-xs" : "px-1 py-1"}>{cell(it, c.key)}</td>
              ))}
            </tr>
          ))}
          <tr className="border-y border-paper-rule font-bold">
            {cols.map((c, i) => <td key={c.key} className={right(c.key) ? "whitespace-nowrap px-1 py-1 text-right" : "px-1 py-1"}>{total(c.key, i)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Nội dung một nhóm; null = không có dữ liệu → không in nhóm đó. */
function blockBody(key: InvoiceBlockKey, s: IssuedInvoiceSnapshot, invoice: IssuedInvoice, layout: InvoiceLayout, packing: boolean): ReactNode {
  const t = s.transport;
  const rows = (r: Rows) => {
    const f = filled(r);
    return f.length ? <RowList rows={f} /> : null;
  };
  switch (key) {
    case "SELLER":
      return (
        <div>
          <p className="font-bold">{s.seller.name}</p>
          {s.seller.address && <p className="whitespace-pre-wrap">{s.seller.address}</p>}
          <p className="text-xs">{L.taxCode}: {s.seller.taxCode}{s.seller.phone ? ` · ${L.tel}: ${s.seller.phone}` : ""}</p>
        </div>
      );
    case "BUYER":
      return s.buyer.name ? (
        <div>
          <p className="font-bold">{s.buyer.name}</p>
          {s.buyer.address && <p className="whitespace-pre-wrap">{s.buyer.address}</p>}
          {s.buyer.country && <p className="text-xs">{L.country}: {s.buyer.country}</p>}
        </div>
      ) : null;
    case "INVOICE_INFO":
      return rows([[packing ? L.refInvoiceNo : L.invoiceNo, invoice.no], [L.date, docDate(s.invoice.date)], [L.contractNo, s.extra.contractNo], [L.poNo, s.invoice.poNo]]);
    case "LC_REF":
      return rows([[L.lcNo, s.extra.lcNo], [L.lcDate, docDate(s.extra.lcDate)], [L.issuingBank, s.extra.lcIssuingBank]]);
    case "SHIPMENT":
      return rows([
        [L.portOfLoading, t.portOfLoading], [L.portOfDischarge, t.portOfDischarge], [L.finalDestination, t.finalDestination], [L.vessel, t.vessel],
        [L.departure, docDate(t.departureDate)], [L.blNo, s.extra.blNo], [L.blDate, docDate(s.extra.blDate)],
      ]);
    case "TERMS":
      return rows([[L.terms, termsLine(s)], [L.payment, s.invoice.paymentTerms]]);
    case "DECLARATION":
      return rows([[L.declarationNo, s.declarationNo]]);
    case "MARKS":
      return s.marks ? <p className="whitespace-pre-wrap">{s.marks}</p> : null;
    case "ITEMS":
      return <ItemsTable s={s} columns={layout.columns} />;
    case "TOTALS":
      return (
        <div className="flex flex-col gap-1">
          <p className="font-bold">{`${money(s.invoice.totalAmount)} ${s.invoice.currency}`}</p>
          <p className="font-bold">{amountInWords(s.invoice.totalAmount, s.invoice.currency)}</p>
        </div>
      );
    case "PACKING": {
      const cont = t.containers.map((c) => [c.no, c.sealNo, c.size].filter(Boolean).join(" / ")).join("; ");
      return rows([
        [L.packages, t.packages ? `${qty(t.packages)} ${t.packageUnit ?? ""}`.trim() : null],
        [L.gross, t.grossWeightKg ? `${formatNumber(t.grossWeightKg, 2, "en")} KGS` : null],
        [L.net, t.netWeightKg ? `${formatNumber(t.netWeightKg, 2, "en")} KGS` : null],
        [L.containers, cont || null],
      ]);
    }
    case "ORIGIN":
      return rows([[L.origin, s.originCountry]]);
    case "STATEMENT":
      return layout.statement ? <p className="whitespace-pre-wrap">{layout.statement}</p> : null;
    case "SIGNATURE":
      return (
        <div className="flex justify-end">
          <div className="flex w-64 flex-col items-center gap-1 text-center">
            <p>{fill(L.forAndOnBehalf, { seller: s.seller.name })}</p>
            <div className="h-20 w-full border-b border-paper-rule" />
            {s.signatory?.name && <p className="font-bold">{s.signatory.name}</p>}
            {s.signatory?.title && <p>{s.signatory.title}</p>}
            <p className="text-xs">{L.authorized}</p>
          </div>
        </div>
      );
  }
}

const WIDE = new Set<InvoiceBlockKey>(["ITEMS", "TOTALS", "MARKS", "STATEMENT", "SIGNATURE"]);

/** Một bản (ORIGINAL/COPY) của hóa đơn hoặc Packing List – một PaperSheet, nội dung dài tự sang trang khi in. */
export function InvoiceDocument({ invoice, snapshot, doc, copy, page, total }: { invoice: IssuedInvoice; snapshot: IssuedInvoiceSnapshot; doc: "invoice" | "packing"; copy: CopyKind; page: number; total: number }) {
  const s = snapshot;
  const packing = doc === "packing";
  const layout = packing ? packingLayout(s.layout) : s.layout;
  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <span className="rounded-sm border-2 border-paper-rule px-2 py-0.5 text-sm font-bold tracking-widest">{copy === "ORIGINAL" ? L.original : L.copy}</span>
      </div>
      <h2 className="text-center text-xl font-bold tracking-widest">{layout.title}</h2>
      {layout.headerNote && <p className="whitespace-pre-wrap text-center text-xs">{layout.headerNote}</p>}
      <p className="sr-only">{invoice.no}</p>
    </div>
  );
  return (
    <PaperSheet page={page} total={total} watermark={invoice.status === "VOID" ? L.void : null} header={header}>
      {layout.blocks.filter((b) => b.visible).map((b) => {
        const body = blockBody(b.key, s, invoice, layout, packing);
        return body ? <Section key={b.key} label={b.label ?? (b.key === "SIGNATURE" ? null : BLOCK_LABELS[b.key])} wide={WIDE.has(b.key)}>{body}</Section> : null;
      })}
    </PaperSheet>
  );
}
