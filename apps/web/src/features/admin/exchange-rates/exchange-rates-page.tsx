"use client";
// Khu Quản trị → Tỷ giá tính thuế (BACKEND-TODO D2): tỷ giá theo tuần, lần lấy Vietcombank gần nhất, thêm/sửa tay kèm lý do.
import { UpsertExchangeRateInputSchema, type ExchangeRate, type ExchangeRateSource } from "@kb/contracts";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, EmptyState, Field, Grid, Input,
  fill, PageHeader, Select, SkeletonCard, SkeletonTable, Stack, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, useMessages, useUiLocale,
  type UiLocale,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Landmark, PencilLine } from "lucide-react";
import { useMemo, useState } from "react";
import { adminKeys, listExchangeRates, upsertExchangeRate } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { EXCHANGE_RATES_MESSAGES } from "./exchange-rates-page.messages";
import { editableWeeks } from "./weeks";

type T = Record<keyof (typeof EXCHANGE_RATES_MESSAGES)["vi"], string>;

const SOURCE_TONE: Record<ExchangeRateSource, "primary" | "warning" | "neutral"> = { VCB: "primary", MANUAL: "warning", SEED: "neutral" };
const sourceLabel = (s: ExchangeRateSource, t: T) => (s === "VCB" ? "Vietcombank" : s === "MANUAL" ? t.sourceManual : t.sourceSeed);

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Ngày/tháng ngắn theo ngôn ngữ: vi "19/10", en/zh "10/19". */
const shortDay = (iso: string, locale: UiLocale) => {
  const [, m, d] = iso.slice(0, 10).split("-");
  return locale === "vi" ? `${d}/${m}` : `${m}/${d}`;
};
/** "19/10 – 25/10"; ngày hiệu lực không phải thứ Hai (dữ liệu mẫu cũ) → "Từ 14/10". */
const weekLabel = (from: string, t: T, locale: UiLocale) =>
  new Date(`${from}T00:00:00Z`).getUTCDay() === 1
    ? `${shortDay(from, locale)} – ${shortDay(addDays(from, 6), locale)}`
    : fill(t.weekFrom, { date: shortDay(from, locale) });

const col = createDataTableColumnHelper<ExchangeRate>();
const makeColumns = (t: T) => col.columns([
  col.accessor("currency", { header: t.colCurrency, meta: { sticky: true }, cell: (c) => <span className="font-mono font-medium">{c.getValue()}</span> }),
  col.accessor("rate", { header: t.colRate, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatMoney(c.getValue())}</span> }),
  col.accessor("source", { header: t.colSource, cell: (c) => <Badge tone={SOURCE_TONE[c.getValue()]} variant="outline" size="sm">{sourceLabel(c.getValue(), t)}</Badge> }),
  col.display({
    id: "detail",
    header: t.colDetail,
    meta: { wrap: true },
    cell: (c) => {
      const r = c.row.original;
      if (r.source === "VCB") return <span className="text-xs text-fg-muted">{r.snapshotAt ? fill(t.vcbBoardAt, { time: formatDateTime(r.snapshotAt) }) : "—"}</span>;
      if (r.source === "MANUAL") return <span className="text-xs text-fg-muted">{[r.updatedByName, r.note].filter(Boolean).join(" · ") || "—"}</span>;
      return <span className="text-xs text-fg-subtle">—</span>;
    },
  }),
]);

function UpsertDialog({ open, onClose, weeks }: { open: boolean; onClose: () => void; weeks: string[] }) {
  const t = useMessages(EXCHANGE_RATES_MESSAGES);
  const locale = useUiLocale();
  const [currency, setCurrency] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(weeks[0] ?? "");
  const [rate, setRate] = useState("");
  const draft = { currency, effectiveFrom, rate: rate.replace(/,/g, "").trim(), reason: "format-check" };
  const check = UpsertExchangeRateInputSchema.safeParse(draft);
  const fieldError = (f: "currency" | "rate") => {
    if (!check.success && (f === "currency" ? currency : rate)) {
      const msg = check.error.issues.find((i) => i.path[0] === f)?.message;
      // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt: ngôn ngữ khác dùng nhãn chung của ô.
      if (!msg || locale === "vi") return msg;
      return f === "currency" ? t.currencyInvalid : t.rateInvalid;
    }
    return undefined;
  };
  const save = useAdminMutation({
    mutationFn: (reason: string) => upsertExchangeRate({ ...draft, reason }),
    success: (r) => fill(t.savedToast, { currency: r.currency, week: weekLabel(r.effectiveFrom, t, locale) }),
    errorTitle: t.saveError,
    onSuccess: () => {
      setCurrency("");
      setRate("");
      onClose();
    },
  });
  const currencyError = fieldError("currency");
  const rateError = fieldError("rate");
  return (
    <ReasonDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t.dialogTitle}
      icon={<PencilLine className="h-4 w-4" />}
      description={t.dialogDescription}
      confirmLabel={t.saveRate}
      pending={save.isPending}
      canSubmit={check.success}
      onConfirm={(reason) => save.mutate(reason)}
    >
      <Grid cols={{ base: 1, md: 2 }}>
        <Field label={t.colCurrency} required hint={t.currencyHint} {...(currencyError ? { error: currencyError } : {})}>
          <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="font-mono" />
        </Field>
        <Field label={t.weekField} required>
          <Select value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} options={weeks.map((w) => ({ value: w, label: fill(t.weekOption, { week: weekLabel(w, t, locale) }) }))} />
        </Field>
        <Field label={t.rateField} required hint={t.rateHint} {...(rateError ? { error: rateError } : {})}>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="tabular-nums" />
        </Field>
      </Grid>
    </ReasonDialog>
  );
}

export function ExchangeRatesPage() {
  const t = useMessages(EXCHANGE_RATES_MESSAGES);
  const locale = useUiLocale();
  const columns = useMemo(() => makeColumns(t), [t]);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.exchangeRates, queryFn: listExchangeRates });
  const { can } = useAdminSession();
  const [tab, setTab] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const weeks = data?.weeks ?? [];
  const current = tab && weeks.some((w) => w.effectiveFrom === tab) ? tab : weeks[0]?.effectiveFrom;
  const editable = editableWeeks(new Date(), weeks.map((w) => w.effectiveFrom));
  const last = data?.lastFetch;

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={can("PLATFORM") ? <Button leftIcon={<PencilLine className="h-4 w-4" />} onClick={() => setEditing(true)} disabled={!data}>{t.addEdit}</Button> : undefined}
      />
      {isError ? (
        <LoadError onRetry={() => void refetch()} title={t.loadError} />
      ) : isLoading || !data ? (
        <>
          <Grid cols={{ base: 1, lg: 2 }}>{[0, 1].map((i) => <SkeletonCard key={i} lines={3} />)}</Grid>
          <SkeletonTable rows={8} />
        </>
      ) : (
        <>
          <Grid cols={{ base: 1, lg: 2 }}>
            <Card>
              <CardHeader>
                <CardTitle as="h3" className="flex items-center gap-2"><Landmark aria-hidden="true" className="h-4 w-4 text-fg-muted" />{t.lastFetch}</CardTitle>
                <CardDescription>{t.lastFetchDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                {last ? (
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={last.status === "OK" ? "PASS" : "FAIL"} label={last.status === "OK" ? t.success : t.error} />
                      <span className="text-sm text-fg-muted">{fill(t.ranWeek, { time: formatDateTime(last.ranAt), week: weekLabel(last.effectiveFrom, t, locale) })}</span>
                    </div>
                    {last.status === "OK" ? (
                      <p className="text-sm text-fg-muted">{fill(t.fetchedCount, { n: last.count, time: last.boardAt ? formatDateTime(last.boardAt) : "—" })}</p>
                    ) : (
                      <Alert tone="danger">{last.error ?? t.unknownError}{t.fetchFailedHint}</Alert>
                    )}
                  </Stack>
                ) : (
                  <p className="text-sm text-fg-muted">{t.neverRun}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle as="h3" className="flex items-center gap-2"><CalendarClock aria-hidden="true" className="h-4 w-4 text-fg-muted" />{t.nextRun}</CardTitle>
                <CardDescription>{t.nextRunDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-fg">{formatDateTime(data.nextRunAt)}</p>
                <p className="mt-1 text-xs text-fg-subtle">{t.crossRateNote}</p>
              </CardContent>
            </Card>
          </Grid>
          {weeks.length === 0 ? (
            <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
          ) : (
            <Tabs value={current ?? ""} onValueChange={setTab}>
              <TabsList aria-label={t.weeksAria}>
                {weeks.map((w) => <TabsTrigger key={w.effectiveFrom} value={w.effectiveFrom}>{weekLabel(w.effectiveFrom, t, locale)}</TabsTrigger>)}
              </TabsList>
              {weeks.map((w) => (
                <TabsContent key={w.effectiveFrom} value={w.effectiveFrom} className="pt-4">
                  <DataTable aria-label={fill(t.tableAria, { week: weekLabel(w.effectiveFrom, t, locale) })} columns={columns} data={w.rates} getRowId={(r) => r.currency} searchable pagination={false} emptyTitle={t.tableEmpty} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </>
      )}
      {editing && <UpsertDialog open onClose={() => setEditing(false)} weeks={editable} />}
    </Stack>
  );
}
