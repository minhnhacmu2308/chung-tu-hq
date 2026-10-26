"use client";
// Màn "Khai báo Hải quan": tờ khai đã duyệt / đang truyền / đã có kết quả.
import {
  Abbreviation, Badge, Button, createDataTableColumnHelper, DataTable, Grid, IconTile, PageHeader, RecordCard, RowActions, Stack,
  pickMessages, StatCard, StatusBadge, statusLabel, useUiLocale, fill, type RecordCardPattern, type Status, type Tone, type UiLocale,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, FolderOpen, Hourglass, Leaf, ScanSearch, Send, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { CUSTOMS_OPERATIONS } from "@kb/contracts";
import { customsKeys, listCustomsDeclarations, type CustomsRow } from "@/api/customs";
import { LoadError } from "@/components/common/load-error";
import { formatDateTime, formatRelative, formatVnd } from "@/lib/format";
import { CUSTOMS_PAGE_MESSAGES } from "./customs.messages";

// Trạng thái tờ khai → mã StatusBadge của @kb/ui (nguồn duy nhất của nhãn + màu).
const STATE = { READY: "CUSTOMS_READY", SENDING: "CUSTOMS_SENDING", INSPECTING: "CUSTOMS_INSPECTING", CLEARED: "CUSTOMS_CLEARED" } as const satisfies Record<CustomsRow["state"], Status>;
const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const;

/** Đầu thẻ theo trạng thái tờ khai (chỉ trang trí – nghĩa nằm ở nhãn trạng thái trên thẻ). */
const CARD_LOOK: Record<CustomsRow["state"], { tone: Tone; pattern: RecordCardPattern; icon: LucideIcon }> = {
  READY: { tone: "neutral", pattern: "dots", icon: Hourglass },
  SENDING: { tone: "info", pattern: "diagonal", icon: Send },
  INSPECTING: { tone: "warning", pattern: "grid", icon: ScanSearch },
  CLEARED: { tone: "success", pattern: "grid", icon: CircleCheck },
};

const submitHref = (r: CustomsRow) => `/dossiers/${r.dossierId}?step=submit`;

/** Loại hình: NK/XK viền + mã – giống danh sách Hồ sơ. */
const TypeCell = ({ r }: { r: CustomsRow }) => (
  <span className="inline-flex items-center gap-1.5">
    <Badge tone={r.direction === "NK" ? "info" : "primary"} variant="outline">{r.direction}</Badge>
    <span className="font-mono text-xs">{r.typeCode}</span>
  </span>
);

const ChannelCell = ({ r }: { r: CustomsRow }) => (r.channel ? <StatusBadge status={CHANNEL_STATUS[r.channel]} /> : <span className="text-fg-subtle">—</span>);

const TaxCell = ({ r }: { r: CustomsRow }) =>
  r.customsTaxVnd ? <span className="tabular-nums">{formatVnd(r.customsTaxVnd)}</span> : <span className="text-fg-subtle">—</span>;

/** Mã nghiệp vụ VNACCS (IID, IEX…): bấm/rê để xem tên đầy đủ – dùng được cả trên điện thoại. */
const OperationCell = ({ r }: { r: CustomsRow }) =>
  r.lastOperation ? (
    <Abbreviation short={r.lastOperation} full={CUSTOMS_OPERATIONS[r.lastOperation].label} className="font-mono text-xs" />
  ) : (
    <span className="text-fg-subtle">—</span>
  );

/** Lô nhiều tờ khai: mỗi tờ một dòng – định danh dòng / nhãn đọc màn hình kèm số tờ (lô 1 tờ giữ như cũ). */
const rowId = (r: CustomsRow) => (r.of > 1 ? `${r.dossierId}:${r.branch}` : r.dossierId);
const rowName = (r: CustomsRow, t: CustomsText) => (r.of > 1 ? fill(t.rowLabelSheet, { code: r.dossierCode, no: r.branch, of: r.of }) : r.dossierCode);
type CustomsText = Record<keyof (typeof CUSTOMS_PAGE_MESSAGES)["vi"], string>;

/** Cột "Tờ": "2/3" (lô 1 tờ để trống). */
const SheetCell = ({ r }: { r: CustomsRow }) => (r.of > 1 ? <span className="tabular-nums">{r.branch}/{r.of}</span> : <span className="text-fg-subtle">—</span>);

const col = createDataTableColumnHelper<CustomsRow>();
/** `sheets`: có lô nhiều tờ khai trong danh sách → thêm cột "Tờ" (không có thì bảng giữ như cũ). */
const buildColumns = (locale: UiLocale, sheets: boolean) => {
  const t = pickMessages(CUSTOMS_PAGE_MESSAGES, locale);
  const sheetCol = col.accessor("branch", { header: t.colSheet, size: 80, minSize: 70, cell: (c) => <SheetCell r={c.row.original} /> });
  return col.columns([
  col.accessor("dossierCode", {
    header: t.colDossier,
    size: 240,
    meta: { hideable: false, wrap: true, sticky: true },
    cell: (c) => (
      <div className="min-w-48">
        <Link href={submitHref(c.row.original)} className="whitespace-nowrap font-mono text-xs text-primary hover:underline">
          {c.getValue()}
        </Link>
        <p className="text-sm text-fg">{c.row.original.partner}</p>
      </div>
    ),
  }),
  ...(sheets ? [sheetCol] : []),
  col.accessor("typeCode", {
    header: t.colType,
    size: 125,
    minSize: 115,
    meta: { filter: "select" },
    cell: (c) => <TypeCell r={c.row.original} />,
  }),
  col.accessor("lastOperation", {
    header: t.colLastOp,
    cell: (c) => <OperationCell r={c.row.original} />,
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
    cell: (c) => <ChannelCell r={c.row.original} />,
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
    cell: (c) => <TaxCell r={c.row.original} />,
  }),
  col.accessor("updatedAt", {
    header: t.colUpdated,
    cell: (c) => <time dateTime={c.getValue()} title={formatDateTime(c.getValue())}>{formatRelative(c.getValue())}</time>,
  }),
  ]);
};

export function CustomsPage() {
  const router = useRouter();
  const locale = useUiLocale();
  const t = pickMessages(CUSTOMS_PAGE_MESSAGES, locale);

  const q = useQuery({
    queryKey: customsKeys.list,
    queryFn: listCustomsDeclarations,
    refetchInterval: (query) => (query.state.data?.some((r) => r.state === "SENDING") ? 2000 : false),
  });
  const rows = q.data ?? [];
  const sheets = rows.some((r) => r.of > 1);
  const columns = useMemo(() => buildColumns(locale, sheets), [locale, sheets]);
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

      <Grid cols={{ base: 2, xl: 4 }} stagger>
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

      {q.isError && <LoadError title={t.loadError} onRetry={() => void q.refetch()} />}
      {!q.isError && (
        <DataTable
          aria-label={t.tableLabel}
          columns={columns}
          data={rows}
          getRowId={rowId}
          rowLabel={(r) => rowName(r, t)}
          loading={q.isLoading}
          searchable
          columnToggle
          resizable
          onRowClick={(r) => router.push(submitHref(r))}
          pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20, 50] }}
          emptyTitle={t.emptyTitle}
          emptyDescription={t.emptyDescription}
          emptyAction={
            <Button size="sm" asChild>
              <Link href="/dossiers">{t.viewDossiers}</Link>
            </Button>
          }
          viewStorageKey="customs"
          rowActions={(r) => (
            <RowActions
              rowLabel={rowName(r, t)}
              actions={[
                { id: "submit", label: t.openSubmit, icon: <Send />, onSelect: () => router.push(submitHref(r)) },
                { id: "dossier", label: t.openDossier, icon: <FolderOpen />, onSelect: () => router.push(`/dossiers/${r.dossierId}`) },
              ]}
            />
          )}
          renderCard={(r, parts) => {
            const look = CARD_LOOK[r.state];
            const Icon = look.icon;
            return (
              <RecordCard
                title={<span className="font-mono">{r.dossierCode}</span>}
                titleLines={1}
                subtitle={r.partner}
                tone={look.tone}
                pattern={look.pattern}
                leading={<IconTile icon={<Icon />} tone={look.tone} size="md" className="bg-surface" />}
                art={<Icon />}
                status={<StatusBadge status={STATE[r.state]} />}
                select={parts.select}
                actions={parts.actions}
                fields={[
                  ...(r.of > 1 ? [{ label: t.colSheet, value: <SheetCell r={r} /> }] : []),
                  { label: t.colType, value: <TypeCell r={r} /> },
                  { label: t.colDeclNo, value: r.declarationNo ? <span className="font-mono">{r.declarationNo}</span> : <span className="text-fg-subtle">{t.notIssued}</span> },
                  { label: t.colChannel, value: <ChannelCell r={r} /> },
                  { label: t.colTax, value: <TaxCell r={r} /> },
                  { label: t.colLastOp, value: <OperationCell r={r} /> },
                ]}
                footer={<time dateTime={r.updatedAt} title={formatDateTime(r.updatedAt)}>{fill(t.updatedAgo, { time: formatRelative(r.updatedAt) })}</time>}
              />
            );
          }}
        />
      )}
    </Stack>
  );
}
