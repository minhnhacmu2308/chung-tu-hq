"use client";
// Dựng lại trang chứng từ gốc từ kết quả trích xuất (prototype chưa có ảnh PDF thật).
// Mỗi trường in đúng vào vùng (region) của nó → rê chuột vào trường bên phải sẽ tô đúng chỗ trên trang.
// Có backend: thay `pages` bằng ảnh trang PDF đã render, giữ nguyên regions.
import { DocumentViewer, fill, useMessages, type DocumentRegion } from "@kb/ui";
import { useMemo } from "react";
import { DOC_KIND_LABELS, type DocKind, type DossierDocument, type ExtractedField } from "@/mocks/types";
import { DOCUMENT_PREVIEW_MESSAGES } from "./common.messages";

const TITLES: Record<DocKind, string> = {
  INVOICE: "COMMERCIAL INVOICE",
  PACKING_LIST: "PACKING LIST",
  BILL_OF_LADING: "BILL OF LADING",
  AIR_WAYBILL: "AIR WAYBILL",
  CERT_OF_ORIGIN: "CERTIFICATE OF ORIGIN",
  SALES_CONTRACT: "SALES CONTRACT",
  ARRIVAL_NOTICE: "ARRIVAL NOTICE",
  // kb-allow-raw: tiêu đề in trên bản dựng lại hóa đơn GTGT Việt Nam (nội dung chứng từ, không phải giao diện)
  FREIGHT_INVOICE: "HÓA ĐƠN GIÁ TRỊ GIA TĂNG",
  OTHER: "DOCUMENT",
};

const SUBTITLES: Partial<Record<DocKind, string>> = {
  INVOICE: "ORIGINAL",
  BILL_OF_LADING: "NON-NEGOTIABLE COPY · PORT-TO-PORT OR COMBINED TRANSPORT",
  CERT_OF_ORIGIN: "ASEAN-KOREA FREE TRADE AREA PREFERENTIAL TARIFF",
  // kb-allow-raw: dòng in trên bản dựng lại hóa đơn GTGT Việt Nam (nội dung chứng từ)
  FREIGHT_INVOICE: "(Bản thể hiện của hóa đơn điện tử)",
};

/** Nhãn in trên chứng từ nước ngoài (tiếng Anh). Hóa đơn GTGT in nhãn tiếng Việt của trường. */
const PRINTED: Record<string, string> = {
  invoice_no: "Invoice No.", invoice_date: "Date", po_no: "P/O No.", vessel: "Vessel / Voyage", seller_name: "Shipper / Exporter",
  seller_address: "Address", buyer_name: "Sold to / Messrs", buyer_tax_code: "Tax code", port_loading: "Port of loading",
  port_discharge: "Port of discharge", port_transshipment: "Port of transshipment", incoterm: "Terms of delivery", currency: "Currency",
  total_quantity: "Total quantity", total_amount: "Total amount", payment_terms: "Terms of payment", country_of_origin: "Country of origin",
  invoice_ref: "Invoice ref.", pl_date: "Date", packages: "No. of packages", gross_weight: "Gross weight", net_weight: "Net weight",
  measurement: "Measurement", shipping_marks: "Shipping marks", bl_no: "B/L No.", onboard_date: "Shipped on board", shipper: "Shipper",
  consignee: "Consignee", notify_party: "Notify party", container: "Container / Seal", freight_terms: "Freight", co_no: "Reference No.",
  co_form: "Form", issue_date: "Issued", exporter: "1. Exporter", importer: "2. Consignee", origin_criterion: "8. Origin criterion",
  hs_codes: "HS code", eta: "ETA", ocean_freight: "Ocean freight", local_charges: "Local charges", title: "Title",
};

const TERMS = [
  "1. DEFINITIONS. “Carrier” means the party on whose behalf this Bill of Lading has been signed. “Merchant” includes the Shipper, Consignee, Receiver and Holder of this Bill of Lading.",
  "2. CARRIER’S TARIFF. The terms of the Carrier’s applicable Tariff are incorporated herein. Copies of the relevant provisions are obtainable from the Carrier upon request.",
  "3. WARRANTY. The Merchant warrants that in agreeing to the terms hereof he is, or has the authority of, the person owning or entitled to the possession of the Goods.",
  "4. SUB-CONTRACTING. The Carrier shall be entitled to sub-contract on any terms the whole or any part of the Carriage.",
  "5. RESPONSIBILITY. The Carrier shall be responsible for loss of or damage to the Goods occurring between the time when he receives the Goods into his charge and the time of delivery.",
];

const ITEM_HEAD = [
  { x: 8, w: 6, text: "No." },
  { x: 14, w: 34, text: "Description of goods" },
  { x: 49, w: 10, text: "Quantity" },
  { x: 60, w: 7, text: "Unit" },
  { x: 68, w: 10, text: "Unit price" },
  { x: 79, w: 11, text: "Amount" },
  { x: 91, w: 6, text: "Origin" },
];

function buildRegions(doc: DossierDocument, fields: ExtractedField[]): DocumentRegion[] {
  const vi = doc.kind === "FREIGHT_INVOICE";
  const out: DocumentRegion[] = [];
  for (let page = 1; page <= Math.max(1, doc.pages); page++) {
    const onPage = fields.filter((f) => f.region?.page === page);
    out.push({
      id: `t-${page}`,
      page,
      x: 8,
      y: 4.5,
      w: 84,
      h: 5,
      content: <span className="block text-center text-base font-bold tracking-widest">{TITLES[doc.kind]}</span>,
    });
    const sub = SUBTITLES[doc.kind];
    if (sub) out.push({ id: `s-${page}`, page, x: 8, y: 9.5, w: 84, h: 2.5, content: <span className="block text-center text-fg-subtle">{sub}</span> });
    out.push({ id: `r-${page}`, page, x: 8, y: 12.6, w: 84, h: 0.5, content: <span className="block h-px bg-border-strong" /> });

    if (onPage.length === 0) {
      // Trang không có trường cần đọc (điều khoản in sẵn) – hệ thống tự bỏ qua khi đọc.
      out.push({
        id: `terms-${page}`,
        page,
        x: 8,
        y: 15,
        w: 84,
        h: 75,
        content: (
          <span className="block space-y-2 text-justify text-fg-subtle">
            {TERMS.map((p) => (
              <span key={p} className="block">
                {p}
              </span>
            ))}
          </span>
        ),
      });
    }

    for (const f of onPage) {
      const r = f.region!;
      const isItem = f.group === "ITEMS";
      if (!isItem) {
        out.push({
          id: `l-${f.id}`,
          page,
          x: r.x,
          y: r.y - 2.3,
          w: r.w,
          h: 2.3,
          content: <span className="block truncate uppercase tracking-wide text-fg-subtle">{vi ? f.label : (PRINTED[f.key] ?? f.label)}</span>,
        });
      }
      out.push({
        id: f.id,
        page,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        label: f.label,
        content: (
          <span className={isItem ? "block truncate px-0.5 py-1" : "block truncate border-b border-dotted border-border-strong px-0.5 py-0.5 font-medium"}>
            {f.value}
          </span>
        ),
      });
    }

    const items = onPage.filter((f) => f.group === "ITEMS");
    if (items.length) {
      const top = Math.min(...items.map((f) => f.region!.y));
      out.push({ id: `ih-bg-${page}`, page, x: 8, y: top - 4.6, w: 84, h: 4, content: <span className="block h-full border-y border-border-strong bg-surface-muted" /> });
      for (const c of ITEM_HEAD) {
        out.push({ id: `ih-${c.text}-${page}`, page, x: c.x, y: top - 4, w: c.w, h: 3, content: <span className="block px-0.5 font-semibold">{c.text}</span> });
      }
      const lines = [...new Set(items.map((f) => f.key.split(".")[1]))];
      for (const n of lines) {
        const y = items.find((f) => f.key.startsWith(`item.${n}.`))!.region!.y;
        out.push({ id: `in-${n}-${page}`, page, x: 8, y, w: 6, h: 3.8, content: <span className="block px-0.5 py-1">{n}</span> });
      }
      const bottom = Math.max(...items.map((f) => f.region!.y + f.region!.h));
      out.push({ id: `if-${page}`, page, x: 8, y: bottom + 0.4, w: 84, h: 0.5, content: <span className="block h-px bg-border-strong" /> });
    }
    if (onPage.length > 0 && page === doc.pages) {
      out.push({
        id: `sig-${page}`,
        page,
        x: 56,
        y: 88,
        w: 36,
        h: 6,
        // kb-allow-raw: chữ ký in trên bản dựng lại hóa đơn GTGT Việt Nam (nội dung chứng từ)
        content: <span className="block border-t border-border-strong pt-1 text-center text-fg-subtle">{vi ? "Người bán hàng (ký số)" : "Authorized signature"}</span>,
      });
    }
  }
  return out;
}

export type DocumentPreviewProps = {
  document: DossierDocument;
  fields: ExtractedField[];
  highlightFieldId?: string | null;
  onFieldClick?: (fieldId: string) => void;
  className?: string;
};

export function DocumentPreview({ document, fields, highlightFieldId = null, onFieldClick, className }: DocumentPreviewProps) {
  const regions = useMemo(() => buildRegions(document, fields), [document, fields]);
  const pages = useMemo(() => Array.from({ length: Math.max(1, document.pages) }, () => null), [document.pages]);
  const t = useMessages(DOCUMENT_PREVIEW_MESSAGES);
  const kindLabels = useMessages(DOC_KIND_LABELS);
  return (
    <DocumentViewer
      key={document.id}
      label={fill(t.originalLabel, { kind: kindLabels[document.kind], file: document.fileName })}
      pages={pages}
      regions={regions}
      highlightId={highlightFieldId}
      {...(onFieldClick ? { onRegionClick: onFieldClick } : {})}
      {...(className ? { className } : {})}
    />
  );
}
