"use client";
// Trang in hóa đơn thương mại / Packing List đã phát hành (ADR 0013 mục 3): thanh công cụ (không in) + bộ bản gốc/bản sao theo mẫu.
import type { IssuedInvoice, IssuedInvoiceSnapshot } from "@kb/contracts";
import { Alert, Button, Field, Input, PageHeader, PageLoading, PaperStack, SegmentedControl, Stack, fill, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getIssuedInvoices, issuedInvoiceKeys } from "@/api/issued-invoice";
import { LoadError } from "@/components/common/load-error";
import { copySet } from "./copies";
import { InvoiceDocument } from "./invoice-document";
import { INVOICE_PRINT_MESSAGES } from "./invoice-print.messages";

export type PrintDoc = "invoice" | "packing";

/** Bộ bản in (không có thanh công cụ) – mặc định số bản theo mẫu in. */
export function InvoicePrintView({ invoice, snapshot, doc, originals, copies }: { invoice: IssuedInvoice; snapshot: IssuedInvoiceSnapshot; doc: PrintDoc; originals?: number; copies?: number }) {
  const set = copySet(originals ?? snapshot.layout.originals, copies ?? snapshot.layout.copies);
  return (
    <PaperStack>
      {set.map((copy, i) => (
        <InvoiceDocument key={`${copy}-${i}`} invoice={invoice} snapshot={snapshot} doc={doc} copy={copy} page={i + 1} total={set.length} />
      ))}
    </PaperStack>
  );
}

const toCount = (v: string, min: number) => Math.min(10, Math.max(min, Number.parseInt(v, 10) || min));

export function InvoicePrintPage({ dossierId, issuedId, doc }: { dossierId: string; issuedId: string; doc: PrintDoc }) {
  const t = useMessages(INVOICE_PRINT_MESSAGES);
  const router = useRouter();
  const q = useQuery({ queryKey: issuedInvoiceKeys.detail(dossierId), queryFn: () => getIssuedInvoices(dossierId) });
  const invoice = q.data?.history.find((h) => h.id === issuedId) ?? null;
  const [originals, setOriginals] = useState<string | null>(null);
  const [copies, setCopies] = useState<string | null>(null);

  if (q.isLoading) return <PageLoading />;
  if (q.isError) return <LoadError title={t.loadFailed} onRetry={() => void q.refetch()} />;
  const snap = invoice?.snapshot ?? null;
  if (!invoice || !snap) return <Alert tone="warning">{t.notFound}</Alert>;
  const o = originals ?? String(snap.layout.originals);
  const c = copies ?? String(snap.layout.copies);

  return (
    <Stack gap="lg">
      <div data-paper-mark className="flex flex-col gap-4 print:hidden">
        <PageHeader
          title={fill(doc === "packing" ? t.titlePacking : t.titleInvoice, { no: invoice.no })}
          description={t.description}
          actions={<Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>{t.print}</Button>}
        />
        <div className="flex flex-wrap items-end gap-4">
          <SegmentedControl
            label={t.document}
            value={doc}
            onChange={(d) => router.replace(`/dossiers/${dossierId}/issued-invoice/${issuedId}/print?doc=${d}`)}
            options={[{ value: "invoice", label: t.showInvoice }, { value: "packing", label: t.showPacking }]}
          />
          <Field label={t.originals} className="w-28">
            <Input value={o} onChange={(e) => setOriginals(e.target.value)} inputMode="numeric" maxLength={2} placeholder={t.countPlaceholder} />
          </Field>
          <Field label={t.copies} className="w-28">
            <Input value={c} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" maxLength={2} placeholder={t.countPlaceholder} />
          </Field>
        </div>
        {invoice.status === "VOID" && <Alert tone="danger">{t.voidNote}</Alert>}
      </div>
      <InvoicePrintView invoice={invoice} snapshot={snap} doc={doc} originals={toCount(o, 1)} copies={toCount(c, 0)} />
    </Stack>
  );
}
