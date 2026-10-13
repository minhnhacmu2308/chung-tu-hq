"use client";
import {
  Alert, Badge, Button, createDataTableColumnHelper, DataTable, Dialog, DialogClose, DialogContent,
  DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  PageHeader, SegmentedControl, Stack, toast, type DataTableColumnVisibility,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderOpen, MoreHorizontal, Plus, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { cancelDossier, dossierKeys, listDossiers } from "@/api/dossiers";
import { listMembers, memberKeys } from "@/api/session";
import { formatMoney } from "@/lib/format";
import { STEP_LABELS, STEP_ORDER, type Direction, type Dossier, type DossierStatus } from "@/mocks/types";
import { DossierStatusBadge, DueBadge } from "./dossier-badges";
import { DIRECTION_LABELS, DOSSIER_STATUS_DISPLAY } from "./dossier-display";

/** Dòng hiển thị: thêm nhãn chữ để ô tìm kiếm/lọc khớp với điều người dùng nhìn thấy. */
type Row = Dossier & { stepLabel: string; statusLabel: string; ownerName: string };

type Scope = "ALL" | Direction;

const col = createDataTableColumnHelper<Row>();
const COLUMNS = col.columns([
  col.accessor("code", {
    header: "Mã hồ sơ",
    size: 160,
    minSize: 140,
    meta: { filter: "text", hideable: false, sticky: true },
    cell: (c) => <span className="font-mono text-xs text-fg">{c.getValue()}</span>,
  }),
  col.accessor("typeCode", {
    header: "Loại hình",
    size: 125,
    minSize: 115,
    meta: { filter: "select" },
    cell: (c) => (
      <span className="inline-flex items-center gap-2">
        <Badge tone={c.row.original.direction === "NK" ? "info" : "primary"} variant="outline">{c.row.original.direction}</Badge>
        {c.getValue()}
      </span>
    ),
  }),
  col.accessor("partner", { header: "Đối tác", size: 210, minSize: 160, meta: { filter: "text", wrap: true } }),
  col.accessor("invoiceValue", {
    header: "Trị giá",
    size: 140,
    meta: { align: "end" },
    sortFn: (a, b) => Number(a.original.invoiceValue) - Number(b.original.invoiceValue),
    cell: (c) => <span className="tabular-nums">{formatMoney(c.getValue(), c.row.original.currency)}</span>,
  }),
  col.accessor("dueDate", { header: "Hạn khai", size: 135, minSize: 120, cell: (c) => <DueBadge dossier={c.row.original} /> }),
  col.accessor("stepLabel", {
    header: "Bước",
    size: 150,
    minSize: 140,
    sortFn: (a, b) => STEP_ORDER.indexOf(a.original.step) - STEP_ORDER.indexOf(b.original.step),
    meta: { filter: "select", filterOptions: STEP_ORDER.map((s) => ({ value: STEP_LABELS[s], label: STEP_LABELS[s] })) },
  }),
  col.accessor("statusLabel", {
    header: "Trạng thái",
    size: 170,
    minSize: 150,
    meta: {
      filter: "select",
      filterOptions: (Object.keys(DOSSIER_STATUS_DISPLAY) as DossierStatus[]).map((s) => ({ value: DOSSIER_STATUS_DISPLAY[s].label, label: DOSSIER_STATUS_DISPLAY[s].label })),
    },
    cell: (c) => <DossierStatusBadge status={c.row.original.status} />,
  }),
  col.accessor("ownerName", { header: "Phụ trách", size: 160, minSize: 120, meta: { filter: "select" } }),
]);

function ListInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("direction");
  const scope: Scope = raw === "NK" || raw === "XK" ? raw : "ALL";

  const qc = useQueryClient();
  const dossiers = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers() });
  const members = useQuery({ queryKey: memberKeys.all, queryFn: listMembers });
  const [toCancel, setToCancel] = useState<Dossier | null>(null);
  // Mặc định ẩn "Phụ trách" cho bảng gọn; bật lại qua nút "Cột".
  const [columnVisibility, setColumnVisibility] = useState<DataTableColumnVisibility>({ ownerName: false });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelDossier(id),
    onSuccess: async (d) => {
      await qc.invalidateQueries({ queryKey: dossierKeys.all });
      toast({ tone: "success", title: "Đã hủy hồ sơ", description: d.code });
      setToCancel(null);
    },
    onError: () => toast({ tone: "danger", title: "Không hủy được hồ sơ", description: "Thử lại sau." }),
  });

  const rows = useMemo<Row[]>(() => {
    const names = new Map(members.data?.map((m) => [m.id, m.name]));
    return (dossiers.data ?? [])
      .filter((d) => scope === "ALL" || d.direction === scope)
      .map((d) => ({
        ...d,
        stepLabel: STEP_LABELS[d.step],
        statusLabel: DOSSIER_STATUS_DISPLAY[d.status].label,
        ownerName: names.get(d.ownerId) ?? "—",
      }));
  }, [dossiers.data, members.data, scope]);

  const setScope = (s: Scope) => {
    const next = new URLSearchParams(params);
    if (s === "ALL") next.delete("direction");
    else next.set("direction", s);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const title = scope === "ALL" ? "Hồ sơ khai báo" : `Hồ sơ ${DIRECTION_LABELS[scope].toLowerCase()}`;

  return (
    <Stack gap="lg">
      <PageHeader
        title={title}
        description="Mỗi hồ sơ là một lô hàng đi qua 6 bước: tạo hồ sơ → upload → OCR & kiểm tra → AI Agent → review tờ khai → khai báo Hải quan."
        actions={
          <>
            <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={() => toast({ tone: "info", title: "Đang xuất Excel", description: "Bản mô phỏng – chưa tạo file thật." })}>
              Xuất Excel
            </Button>
            <Button asChild>
              <Link href="/dossiers/new"><Plus className="h-4 w-4" aria-hidden="true" />Tạo hồ sơ</Link>
            </Button>
          </>
        }
      />

      {dossiers.isError && (
        <Alert tone="danger" title="Không tải được danh sách hồ sơ" action={<Button size="sm" variant="secondary" onClick={() => dossiers.refetch()}>Thử lại</Button>}>
          Kiểm tra kết nối rồi thử lại.
        </Alert>
      )}

      <Stack gap="md">
            <SegmentedControl<Scope>
              label="Phạm vi"
              hideLabel
              className="justify-start"
              value={scope}
              onChange={setScope}
              options={[
                { value: "ALL", label: "Tất cả" },
                { value: "NK", label: "Nhập khẩu" },
                { value: "XK", label: "Xuất khẩu" },
              ]}
            />
            <DataTable
              aria-label={title}
              columns={COLUMNS}
              data={rows}
              getRowId={(r) => r.id}
              rowLabel={(r) => r.code}
              loading={dossiers.isLoading}
              selectable
              searchable
              columnToggle
              resizable
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20, 50] }}
              onRowClick={(r) => router.push(`/dossiers/${r.id}`)}
              emptyTitle="Chưa có hồ sơ"
              emptyDescription="Tạo hồ sơ cho lô hàng đầu tiên, sau đó upload bộ chứng từ để AI đọc."
              emptyAction={<Button asChild size="sm"><Link href="/dossiers/new">Tạo hồ sơ</Link></Button>}
              rowActions={(r) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label={`Thao tác cho ${r.code}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem icon={<FolderOpen className="h-4 w-4" />} onSelect={() => router.push(`/dossiers/${r.id}`)}>
                      Mở hồ sơ
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      icon={<XCircle className="h-4 w-4" />}
                      tone="danger"
                      disabled={r.status === "CANCELLED" || r.status === "CLEARED" || r.status === "SUBMITTED"}
                      onSelect={() => setToCancel(r)}
                    >
                      Hủy hồ sơ
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            />
      </Stack>

      <Dialog open={toCancel !== null} onOpenChange={(o) => !o && setToCancel(null)}>
        <DialogContent title="Hủy hồ sơ?" size="sm" icon={<XCircle className="h-4 w-4" />}>
          <p className="text-sm text-fg-muted">
            Hồ sơ <span className="font-mono text-fg">{toCancel?.code}</span> – {toCancel?.partner} sẽ chuyển sang trạng thái “Đã hủy”.
            Chứng từ và lịch sử vẫn được giữ lại để tra cứu.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Không hủy</Button>
            </DialogClose>
            <Button variant="danger" loading={cancel.isPending} onClick={() => toCancel && cancel.mutate(toCancel.id)}>
              Hủy hồ sơ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

export function DossierListPage() {
  return (
    <Suspense>
      <ListInner />
    </Suspense>
  );
}
