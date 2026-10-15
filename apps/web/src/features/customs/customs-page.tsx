"use client";
// Màn "Khai báo Hải quan": tờ khai đã duyệt / đang truyền / đã có kết quả.
import {
  Alert, Badge, Button, Card, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Grid, PageHeader, Stack,
  StatCard, STATUS_META, StatusBadge, type Status,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Hourglass, Leaf, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CUSTOMS_OPERATIONS } from "@kb/contracts";
import { customsKeys, listCustomsDeclarations, type CustomsRow } from "@/api/customs";
import { formatDateTime, formatRelative, formatVnd } from "@/lib/format";

// Trạng thái tờ khai → mã StatusBadge của @kb/ui (nguồn duy nhất của nhãn + màu).
const STATE = { READY: "CUSTOMS_READY", SENDING: "CUSTOMS_SENDING", INSPECTING: "CUSTOMS_INSPECTING", CLEARED: "CUSTOMS_CLEARED" } as const satisfies Record<CustomsRow["state"], Status>;
const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const;

const col = createDataTableColumnHelper<CustomsRow>();
const COLUMNS = col.columns([
  col.accessor("dossierCode", {
    header: "Hồ sơ",
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
      filterOptions: (Object.keys(STATE) as CustomsRow["state"][]).map((v) => ({ value: v, label: STATUS_META[STATE[v]].label })),
    },
    cell: (c) => <StatusBadge status={STATE[c.getValue()]} />,
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

      <Grid cols={{ base: 1, sm: 2, xl: 4 }} stagger>
        <StatCard icon={<Hourglass />} tone="neutral" label="Chờ truyền" loading={q.isLoading} value={count("READY")} hint="Đã phê duyệt, chưa ký số" />
        <StatCard icon={<Send />} tone="info" label="Đang truyền / kiểm tra" loading={q.isLoading} value={count("SENDING") + count("INSPECTING")} hint="Chờ phản hồi hoặc kiểm tra hồ sơ" />
        <StatCard icon={<CircleCheck />} tone="success" label="Đã thông quan" loading={q.isLoading} value={count("CLEARED")} hint="Trong dữ liệu hiện có" />
        <StatCard
          icon={<Leaf />}
          tone="success"
          label="Tỷ lệ luồng xanh"
          loading={q.isLoading}
          value={withChannel.length ? `${Math.round((green / withChannel.length) * 100)}%` : "—"}
          hint={`${green}/${withChannel.length} tờ khai đã phân luồng`}
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
