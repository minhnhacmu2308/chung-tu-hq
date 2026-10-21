"use client";
// Màn "Khai báo Hải quan": tờ khai đã duyệt / đang truyền / đã có kết quả.
import {
  Alert, Badge, Button, Card, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Grid, PageHeader, Stack,
  pickMessages, StatCard, StatusBadge, statusLabel, useUiLocale, fill, type Status, type UiLocale,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Hourglass, Leaf, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { CUSTOMS_OPERATIONS } from "@kb/contracts";
import { customsKeys, listCustomsDeclarations, type CustomsRow } from "@/api/customs";
import { formatDateTime, formatRelative, formatVnd } from "@/lib/format";
import { CUSTOMS_PAGE_MESSAGES } from "./customs.messages";

// Trạng thái tờ khai → mã StatusBadge của @kb/ui (nguồn duy nhất của nhãn + màu).
const STATE = { READY: "CUSTOMS_READY", SENDING: "CUSTOMS_SENDING", INSPECTING: "CUSTOMS_INSPECTING", CLEARED: "CUSTOMS_CLEARED" } as const satisfies Record<CustomsRow["state"], Status>;
const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const;

const col = createDataTableColumnHelper<CustomsRow>();
const buildColumns = (locale: UiLocale) => {
  const t = pickMessages(CUSTOMS_PAGE_MESSAGES, locale);
  return col.columns([
  col.accessor("dossierCode", {
    header: t.colDossier,
    size: 240,
    meta: { hideable: false, wrap: true, sticky: true },
    cell: (c) => (
      <div className="min-w-48">
        <Link href={`/dossiers/${c.row.original.dossierId}?step=submit`} className="whitespace-nowrap font-mono text-xs text-primary hover:underline">
          {c.getValue()}
        </Link>
        <p className="text-sm text-fg">{c.row.original.partner}</p>
      </div>
    ),
  }),
  col.accessor("typeCode", {
    header: t.colType,
    size: 160,
    meta: { filter: "select" },
    cell: (c) => (
      <span className="inline-flex items-center gap-2">
        <Badge tone={c.row.original.direction === "NK" ? "info" : "primary"}>{c.row.original.direction === "NK" ? t.import : t.export}</Badge>
        <span className="font-mono text-xs">{c.getValue()}</span>
      </span>
    ),
  }),
  col.accessor("lastOperation", {
    header: t.colLastOp,
    cell: (c) => {
      const op = c.getValue();
      return op ? (
        <span title={CUSTOMS_OPERATIONS[op].label}>
          <Badge tone="neutral" variant="outline" className="font-mono">
            {op}
          </Badge>
        </span>
      ) : (
        <span className="text-fg-subtle">—</span>
      );
    },
  }),
  col.accessor("declarationNo", {
    header: t.colDeclNo,
    cell: (c) => (c.getValue() ? <span className="font-mono text-sm">{c.getValue()}</span> : <span className="text-fg-subtle">{t.notIssued}</span>),
  }),
  col.accessor("channel", {
    header: t.colChannel,
    meta: {
      filter: "select",
      filterOptions: [
        { value: "GREEN", label: statusLabel(CHANNEL_STATUS.GREEN, locale) },
        { value: "YELLOW", label: statusLabel(CHANNEL_STATUS.YELLOW, locale) },
        { value: "RED", label: statusLabel(CHANNEL_STATUS.RED, locale) },
      ],
    },
    cell: (c) => {
      const ch = c.getValue();
      return ch ? <StatusBadge status={CHANNEL_STATUS[ch]} /> : <span className="text-fg-subtle">—</span>;
    },
  }),
  col.accessor("state", {
    header: t.colStatus,
    meta: {
      filter: "select",
      filterOptions: (Object.keys(STATE) as CustomsRow["state"][]).map((v) => ({ value: v, label: statusLabel(STATE[v], locale) })),
    },
    cell: (c) => <StatusBadge status={STATE[c.getValue()]} />,
  }),
  col.accessor("customsTaxVnd", {
    header: t.colTax,
    meta: { align: "end" },
    cell: (c) => (c.getValue() ? <span className="tabular-nums">{formatVnd(c.getValue()!)}</span> : <span className="text-fg-subtle">—</span>),
  }),
  col.accessor("updatedAt", {
    header: t.colUpdated,
    cell: (c) => <span title={formatDateTime(c.getValue())}>{formatRelative(c.getValue())}</span>,
  }),
  ]);
};

export function CustomsPage() {
  const router = useRouter();
  const locale = useUiLocale();
  const t = pickMessages(CUSTOMS_PAGE_MESSAGES, locale);
  const columns = useMemo(() => buildColumns(locale), [locale]);
  const q = useQuery({
    queryKey: customsKeys.list,
    queryFn: listCustomsDeclarations,
    refetchInterval: (query) => (query.state.data?.some((r) => r.state === "SENDING") ? 2000 : false),
  });
  const rows = q.data ?? [];
  const withChannel = rows.filter((r) => r.channel);
  const green = withChannel.filter((r) => r.channel === "GREEN").length;
  const count = (s: CustomsRow["state"]) => rows.filter((r) => r.state === s).length;

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/dossiers">{t.openList}</Link>
          </Button>
        }
      />

      <Grid cols={{ base: 1, sm: 2, xl: 4 }} stagger>
        <StatCard icon={<Hourglass />} tone="neutral" label={t.statReady} loading={q.isLoading} value={count("READY")} hint={t.statReadyHint} />
        <StatCard icon={<Send />} tone="info" label={t.statSending} loading={q.isLoading} value={count("SENDING") + count("INSPECTING")} hint={t.statSendingHint} />
        <StatCard icon={<CircleCheck />} tone="success" label={t.statCleared} loading={q.isLoading} value={count("CLEARED")} hint={t.statClearedHint} />
        <StatCard
          icon={<Leaf />}
          tone="success"
          label={t.statGreen}
          loading={q.isLoading}
          value={withChannel.length ? `${Math.round((green / withChannel.length) * 100)}%` : "—"}
          hint={fill(t.statGreenHint, { green, total: withChannel.length })}
        />
      </Grid>

      {q.isError ? (
        <Alert
          tone="danger"
          title={t.loadError}
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              {t.retry}
            </Button>
          }
        >
          {q.error instanceof Error ? q.error.message : t.unknownError}
        </Alert>
      ) : (
        <Card className="p-4">
          <DataTable
            aria-label={t.tableLabel}
            columns={columns}
            data={rows}
            getRowId={(r) => r.dossierId}
            loading={q.isLoading}
            searchable
            columnToggle
            onRowClick={(r) => router.push(`/dossiers/${r.dossierId}?step=submit`)}
            pagination={{ initialPageSize: 10 }}
            emptyTitle={t.emptyTitle}
            emptyDescription={t.emptyDescription}
            emptyAction={
              <Button size="sm" asChild>
                <Link href="/dossiers">{t.viewDossiers}</Link>
              </Button>
            }
          />
        </Card>
      )}
    </Stack>
  );
}
