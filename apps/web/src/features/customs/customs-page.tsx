"use client";
// Màn "Khai báo Hải quan": tờ khai đã duyệt / đang truyền / đã có kết quả.
import {
  Alert, Badge, Button, Card, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Grid, PageHeader, Stack,
  StatusBadge,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { customsKeys, listCustomsDeclarations, OPERATION_LABELS, type CustomsRow } from "@/api/customs";
import { formatDateTime, formatRelative, formatVnd } from "@/lib/format";

const STATE: Record<CustomsRow["state"], { text: string; tone: "warning" | "info" | "success" | "neutral" }> = {
  READY: { text: "Chờ truyền", tone: "neutral" },
  SENDING: { text: "Đang truyền", tone: "info" },
  INSPECTING: { text: "Đang kiểm tra", tone: "warning" },
  CLEARED: { text: "Đã thông quan", tone: "success" },
};
const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const;

const col = createDataTableColumnHelper<CustomsRow>();
const COLUMNS = col.columns([
  col.accessor("dossierCode", {
    header: "Hồ sơ",
    size: 240,
    meta: { hideable: false, wrap: true },
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
    header: "Loại hình",
    size: 160,
    meta: { filter: "select" },
    cell: (c) => (
      <span className="inline-flex items-center gap-2">
        <Badge tone={c.row.original.direction === "NK" ? "info" : "primary"}>{c.row.original.direction === "NK" ? "Nhập" : "Xuất"}</Badge>
        <span className="font-mono text-xs">{c.getValue()}</span>
      </span>
    ),
  }),
  col.accessor("lastOperation", {
    header: "Nghiệp vụ gần nhất",
    cell: (c) => {
      const op = c.getValue();
      return op ? (
        <span title={OPERATION_LABELS[op]}>
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
    header: "Số tờ khai",
    cell: (c) => (c.getValue() ? <span className="font-mono text-sm">{c.getValue()}</span> : <span className="text-fg-subtle">Chưa cấp</span>),
  }),
  col.accessor("channel", {
    header: "Phân luồng",
    meta: {
      filter: "select",
      filterOptions: [
        { value: "GREEN", label: "Luồng xanh" },
        { value: "YELLOW", label: "Luồng vàng" },
        { value: "RED", label: "Luồng đỏ" },
      ],
    },
    cell: (c) => {
      const ch = c.getValue();
      return ch ? <StatusBadge status={CHANNEL_STATUS[ch]} /> : <span className="text-fg-subtle">—</span>;
    },
  }),
  col.accessor("state", {
    header: "Trạng thái",
    meta: {
      filter: "select",
      filterOptions: (Object.keys(STATE) as CustomsRow["state"][]).map((v) => ({ value: v, label: STATE[v].text })),
    },
    cell: (c) => <Badge tone={STATE[c.getValue()].tone}>{STATE[c.getValue()].text}</Badge>,
  }),
  col.accessor("customsTaxVnd", {
    header: "Thuế HQ tính",
    meta: { align: "end" },
    cell: (c) => (c.getValue() ? <span className="tabular-nums">{formatVnd(c.getValue()!)}</span> : <span className="text-fg-subtle">—</span>),
  }),
  col.accessor("updatedAt", {
    header: "Cập nhật",
    cell: (c) => <span title={formatDateTime(c.getValue())}>{formatRelative(c.getValue())}</span>,
  }),
]);

function Kpi({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle as="h3" className="text-2xl tabular-nums">
          {value}
        </CardTitle>
        <p className="text-xs text-fg-subtle">{note}</p>
      </CardHeader>
    </Card>
  );
}

export function CustomsPage() {
  const router = useRouter();
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
        title="Khai báo Hải quan"
        description="Tờ khai đã phê duyệt và kết quả truyền nhận VNACCS qua Customs Hub: số tờ khai, phân luồng, thông quan."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/dossiers">Mở danh sách hồ sơ</Link>
          </Button>
        }
      />

      <Grid cols={{ base: 1, sm: 2, xl: 4 }}>
        <Kpi title="Chờ truyền" value={q.isLoading ? "…" : String(count("READY"))} note="Đã phê duyệt, chưa ký số" />
        <Kpi title="Đang truyền / kiểm tra" value={q.isLoading ? "…" : String(count("SENDING") + count("INSPECTING"))} note="Chờ phản hồi hoặc kiểm tra hồ sơ" />
        <Kpi title="Đã thông quan" value={q.isLoading ? "…" : String(count("CLEARED"))} note="Trong dữ liệu hiện có" />
        <Kpi
          title="Tỷ lệ luồng xanh"
          value={q.isLoading ? "…" : withChannel.length ? `${Math.round((green / withChannel.length) * 100)}%` : "—"}
          note={`${green}/${withChannel.length} tờ khai đã phân luồng`}
        />
      </Grid>

      {q.isError ? (
        <Alert
          tone="danger"
          title="Không tải được danh sách tờ khai"
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              Thử lại
            </Button>
          }
        >
          {q.error instanceof Error ? q.error.message : "Lỗi không xác định"}
        </Alert>
      ) : (
        <Card className="p-4">
          <DataTable
            aria-label="Tờ khai Hải quan"
            columns={COLUMNS}
            data={rows}
            getRowId={(r) => r.dossierId}
            loading={q.isLoading}
            searchable
            columnToggle
            onRowClick={(r) => router.push(`/dossiers/${r.dossierId}?step=submit`)}
            pagination={{ initialPageSize: 10 }}
            emptyTitle="Chưa có tờ khai nào được phê duyệt"
            emptyDescription="Tờ khai xuất hiện ở đây sau khi Người duyệt phê duyệt ở bước Review tờ khai."
            emptyAction={
              <Button size="sm" asChild>
                <Link href="/dossiers">Xem hồ sơ</Link>
              </Button>
            }
          />
        </Card>
      )}
    </Stack>
  );
}
