"use client";
// Khối "Hóa đơn thương mại" ở bước OCR & kiểm tra (ADR 0013 mục 3 – quyết định 2026-11-12).
// Cách A: Cấp số (theo mẫu số doanh nghiệp) → số điền vào chỉ tiêu Số hóa đơn; thông quan rồi Phát hành theo mẫu in → In. Hủy số không dùng lại.
import type { IssueAction, IssuedInvoice, IssuedInvoiceSnapshot, IssuedInvoicesView, ReleaseExtraInput } from "@kb/contracts";
import {
  Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, DatePicker, Dialog, DialogContent, DialogFooter, Field, Input,
  Select, SkeletonList, Stack, StatusBadge, Textarea, fill, toast, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, FileCheck2, Hash, Printer, RefreshCw } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { declarationKeys } from "@/api/declaration";
import { dossierKeys } from "@/api/dossiers";
import { getIssuedInvoices, issueInvoiceAction, issuedInvoiceKeys } from "@/api/issued-invoice";
import { ocrKeys } from "@/api/ocr";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { ISSUED_INVOICE_MESSAGES } from "./issued-invoice.messages";

type T = (typeof ISSUED_INVOICE_MESSAGES)["vi"];
const STATUS = { RESERVED: "ISSUED_RESERVED", ISSUED: "ISSUED_ACTIVE", VOID: "ISSUED_VOID" } as const;
/** Trang in hóa đơn / Packing List của một bản đã phát hành (mở tab mới). */
const printHref = (dossierId: string, issuedId: string, doc: "invoice" | "packing") => `/dossiers/${dossierId}/issued-invoice/${issuedId}/print?doc=${doc}`;

function PrintLinks({ t, dossierId, issuedId }: { t: T; dossierId: string; issuedId: string }) {
  return (
    <span className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="secondary" leftIcon={<Printer className="h-4 w-4" />}>
        <a href={printHref(dossierId, issuedId, "invoice")} target="_blank" rel="noopener">{t.printInvoice}</a>
      </Button>
      <Button asChild size="sm" variant="ghost" leftIcon={<Printer className="h-4 w-4" />}>
        <a href={printHref(dossierId, issuedId, "packing")} target="_blank" rel="noopener">{t.printPacking}</a>
      </Button>
    </span>
  );
}

function Item({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={mono ? "font-mono font-medium text-fg" : "font-medium text-fg"}>{children}</dd>
    </div>
  );
}

function Summary({ t, snap }: { t: T; snap: IssuedInvoiceSnapshot }) {
  const terms = [snap.invoice.incoterm, snap.invoice.incotermPlace].filter(Boolean).join(" ");
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm cq-md:grid-cols-4">
      <Item label={t.buyer}>{snap.buyer.name ?? "–"}</Item>
      <Item label={t.terms}>{terms || "–"}</Item>
      <Item label={t.lines}>{fill(t.linesCount, { n: snap.items.length })}</Item>
      <Item label={t.total} mono>{formatMoney(snap.invoice.totalAmount, snap.invoice.currency)}</Item>
    </dl>
  );
}

type Extra = { contractNo: string; lcNo: string; lcDate: string | null; lcIssuingBank: string; blNo: string; blDate: string | null };
const BUILT_IN = "__builtin";

function ReleaseDialog({ open, onOpenChange, view, current, onRelease, pending }: {
  open: boolean; onOpenChange: (o: boolean) => void; view: IssuedInvoicesView; current: IssuedInvoice; pending: boolean;
  onRelease: (templateId: string | null, extra: ReleaseExtraInput) => void;
}) {
  const t = useMessages(ISSUED_INVOICE_MESSAGES);
  const prev = current.snapshot?.extra;
  const [templateId, setTemplateId] = useState(current.templateId ?? view.templates.find((x) => x.isDefault)?.id ?? BUILT_IN);
  const [x, setX] = useState<Extra>({
    contractNo: prev?.contractNo ?? "", lcNo: prev?.lcNo ?? "", lcDate: prev?.lcDate ?? null, lcIssuingBank: prev?.lcIssuingBank ?? "", blNo: prev?.blNo ?? "", blDate: prev?.blDate ?? null,
  });
  const set = <K extends keyof Extra>(k: K, v: Extra[K]) => setX({ ...x, [k]: v });
  const options = [
    ...view.templates.map((tpl) => ({ value: tpl.id, label: tpl.isDefault ? fill(t.templateDefaultMark, { name: tpl.name }) : tpl.name })),
    ...(view.templates.length ? [] : [{ value: BUILT_IN, label: t.templateDefaultBuiltIn }]),
  ];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onRelease(templateId === BUILT_IN ? null : templateId, { ...x });
  };
  const snap = view.preview;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={fill(t.releaseTitle, { no: current.no })} icon={<FileCheck2 className="h-4 w-4" />} description={t.releaseDescription}>
        <form onSubmit={submit} noValidate>
          <Stack gap="md">
            {snap && (
              <>
                <dl className="grid gap-x-6 gap-y-2 text-sm cq-md:grid-cols-3">
                  <Item label={t.invoiceNo} mono>{current.no}</Item>
                  <Item label={t.invoiceDate}>{formatDate(snap.invoice.date)}</Item>
                  <Item label={t.declarationNo} mono>{snap.declarationNo ?? "–"}</Item>
                </dl>
                <Summary t={t} snap={snap} />
              </>
            )}
            <Field label={t.template} hint={t.templateHint}>
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} options={options} />
            </Field>
            <Stack gap="sm">
              <p className="text-sm font-medium text-fg">{t.extraTitle}</p>
              <p className="text-xs text-fg-subtle">{t.extraHint}</p>
              <div className="grid gap-4 cq-md:grid-cols-2">
                <Field label={t.contractNo}><Input value={x.contractNo} onChange={(e) => set("contractNo", e.target.value)} maxLength={50} placeholder={t.contractNoPlaceholder} /></Field>
                <Field label={t.lcNo}><Input value={x.lcNo} onChange={(e) => set("lcNo", e.target.value)} maxLength={35} placeholder={t.lcNoPlaceholder} /></Field>
                <Field label={t.lcDate}><DatePicker value={x.lcDate} onChange={(v) => set("lcDate", v)} /></Field>
                <Field label={t.lcIssuingBank}><Input value={x.lcIssuingBank} onChange={(e) => set("lcIssuingBank", e.target.value)} maxLength={255} placeholder={t.lcIssuingBankPlaceholder} /></Field>
                <Field label={t.blNo}><Input value={x.blNo} onChange={(e) => set("blNo", e.target.value)} maxLength={35} placeholder={t.blNoPlaceholder} /></Field>
                <Field label={t.blDate}><DatePicker value={x.blDate} onChange={(v) => set("blDate", v)} /></Field>
              </div>
            </Stack>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" leftIcon={<FileCheck2 className="h-4 w-4" />} loading={pending}>{t.confirmRelease}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryList({ t, rows }: { t: T; rows: IssuedInvoice[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-fg">{t.history}</p>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {rows.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="font-mono text-fg">{h.no}</span>
            <span className="flex flex-wrap items-center gap-2 text-fg-muted">
              <StatusBadge status={STATUS[h.status]} />
              {formatDateTime(h.voidedAt ?? h.releasedAt ?? h.reservedAt)}
            </span>
            {h.voidReason && <span className="w-full text-xs text-fg-muted">{fill(t.voidReasonShown, { reason: h.voidReason })}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IssuedInvoiceCard({ dossierId }: { dossierId: string }) {
  const t = useMessages(ISSUED_INVOICE_MESSAGES);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: issuedInvoiceKeys.detail(dossierId), queryFn: () => getIssuedInvoices(dossierId) });
  const [dialog, setDialog] = useState<"reserve" | "release" | "void" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const act = useMutation({
    mutationFn: (a: IssueAction) => issueInvoiceAction(dossierId, a),
    onSuccess: (v, a) => {
      qc.setQueryData(issuedInvoiceKeys.detail(dossierId), v);
      if (a.action !== "RELEASE") {
        // Cấp/hủy số đổi chỉ tiêu Số hóa đơn → luật, trường, tờ khai nháp đổi theo.
        void qc.invalidateQueries({ queryKey: ocrKeys.checks(dossierId) });
        void qc.invalidateQueries({ queryKey: ocrKeys.fields(dossierId) });
        void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
        void qc.invalidateQueries({ queryKey: dossierKeys.detail(dossierId) });
      }
      if (a.action === "VOID") toast({ tone: "success", title: fill(t.voided, { no: v.history[0]?.no ?? "" }), ...(v.declared ? { description: t.voidedDeclaredDesc } : {}) });
      else if (a.action === "RESERVE") toast({ tone: "success", title: fill(t.reserved, { no: v.current?.no ?? "" }), description: t.reservedDesc });
      else toast({ tone: "success", title: fill(t.released, { no: v.current?.no ?? "" }) });
      setDialog(null);
      setReason("");
    },
    onError: toastMutationError(t.actionFailed),
  });
  const v = q.data;
  // Nguồn Invoice đã đổi sang tải lên: chỉ còn hiện khi còn số đang dùng (để hủy số đó).
  if (v && !v.enabled && !v.current) return null;
  const current = v?.current ?? null;
  const dataBlockers = v?.blockers.filter((b) => b !== "NOT_CLEARED") ?? [];
  const confirmVoid = () => {
    if (!reason.trim()) return setReasonError(true);
    act.mutate({ action: "VOID", reason: reason.trim() });
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {v?.editable && !current && (
            <Button size="sm" leftIcon={<Hash className="h-4 w-4" />} onClick={() => setDialog("reserve")}>{t.reserve}</Button>
          )}
          {v?.canRelease && v.cleared && current && (
            <Button
              size="sm"
              variant={current.status === "ISSUED" ? "secondary" : "primary"}
              leftIcon={current.status === "ISSUED" ? <RefreshCw className="h-4 w-4" /> : <FileCheck2 className="h-4 w-4" />}
              disabled={dataBlockers.length > 0}
              onClick={() => setDialog("release")}
            >
              {current.status === "ISSUED" ? t.rerelease : t.release}
            </Button>
          )}
          {v?.canVoid && current && (
            <Button size="sm" variant="danger-outline" leftIcon={<Ban className="h-4 w-4" />} onClick={() => setDialog("void")}>{t.void}</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <SkeletonList rows={2} />
        ) : q.isError || !v ? (
          <LoadError title={t.loadFailed} onRetry={() => void q.refetch()} />
        ) : (
          <Stack gap="md">
            {current ? (
              <>
                <dl className="grid gap-x-6 gap-y-2 text-sm cq-md:grid-cols-4">
                  <Item label={t.invoiceNo}>
                    <span className="flex flex-wrap items-center gap-2"><span className="font-mono">{current.no}</span><StatusBadge status={STATUS[current.status]} /></span>
                  </Item>
                  {current.snapshot && <Item label={t.invoiceDate}>{formatDate(current.snapshot.invoice.date)}</Item>}
                  <Item label={t.reservedAtLabel}>{formatDateTime(current.reservedAt)}</Item>
                  {current.releasedAt && <Item label={t.releasedAtLabel}>{formatDateTime(current.releasedAt)}</Item>}
                </dl>
                {current.snapshot ? (
                  <>
                    <Summary t={t} snap={current.snapshot} />
                    <PrintLinks t={t} dossierId={dossierId} issuedId={current.id} />
                  </>
                ) : (
                  <Alert tone="info">{v.cleared ? t.clearedInfo : t.reservedInfo}</Alert>
                )}
              </>
            ) : (
              <Stack gap="xs">
                <p className="text-sm text-fg-muted">{t.notReserved}</p>
                {v.editable && <p className="text-sm text-fg">{t.nextNo} <span className="font-mono font-medium">{v.nextNo}</span></p>}
              </Stack>
            )}
            {current && v.cleared && dataBlockers.length > 0 && (
              <Alert tone="warning" title={t.missingTitle}>
                <p>{t.missingHint}</p>
                <ul className="list-disc pl-5">
                  {dataBlockers.map((b) => <li key={b}>{t[b]}</li>)}
                </ul>
              </Alert>
            )}
            {current && !v.enabled && <Alert tone="warning">{t.sourceChanged}</Alert>}
            {current && v.declared && v.editable && <Alert tone="info">{t.declared}</Alert>}
            {!v.editable && current && current.status === "RESERVED" && !v.cleared && <Alert tone="info">{t.locked}</Alert>}
            {v.history.length > (current ? 1 : 0) && <HistoryList t={t} rows={v.history} />}
          </Stack>
        )}
      </CardContent>

      {v && (
        <ConfirmDialog
          open={dialog === "reserve"}
          onOpenChange={(o) => !o && setDialog(null)}
          tone="warning"
          icon={<Hash className="h-4 w-4" />}
          title={fill(t.reserveTitle, { no: v.nextNo })}
          confirmLabel={t.reserve}
          loading={act.isPending}
          onConfirm={() => act.mutate({ action: "RESERVE" })}
        >
          <p>{t.reserveBody}</p>
        </ConfirmDialog>
      )}
      {dialog === "release" && v && current && (
        <ReleaseDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          view={v}
          current={current}
          pending={act.isPending}
          onRelease={(templateId, extra) => act.mutate({ action: "RELEASE", templateId, extra })}
        />
      )}
      {current && (
        <ConfirmDialog
          open={dialog === "void"}
          onOpenChange={(o) => {
            if (!o) setDialog(null);
            setReasonError(false);
          }}
          icon={<Ban className="h-4 w-4" />}
          title={fill(t.voidTitle, { no: current.no })}
          confirmLabel={t.void}
          irreversible
          loading={act.isPending}
          onConfirm={confirmVoid}
        >
          <Stack gap="sm">
            <p>{t.voidBody}</p>
            {v?.declared && <p>{t.voidedDeclaredDesc}</p>}
            <Field label={t.voidReason} {...(reasonError ? { error: t.voidReasonRequired } : {})}>
              <Textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setReasonError(false);
                }}
                maxLength={200}
                rows={2}
                placeholder={t.voidReasonPlaceholder}
              />
            </Field>
          </Stack>
        </ConfirmDialog>
      )}
    </Card>
  );
}
