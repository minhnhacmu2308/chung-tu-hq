"use client";
import type { SkillTemplate } from "@kb/contracts";
import { Alert, createDataTableColumnHelper, DataTable, PageHeader, RowActions, Stack, StatusBadge } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CircleOff, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
import { adminKeys, listSkillTemplates, setSkillTemplatePublished } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatRelative } from "@/lib/format";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { SKILL_KIND_LABELS, statusLabel } from "../common/admin-display";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";

type Row = SkillTemplate & { kindLabel: string; docLabel: string; statusText: string };
const status = (t: SkillTemplate) => (t.published ? "TEMPLATE_PUBLISHED" : "TEMPLATE_DRAFT");

const col = createDataTableColumnHelper<Row>();
const COLUMNS = col.columns([
  col.accessor("code", { header: "Mã skill", size: 150, meta: { hideable: false, sticky: true }, cell: (c) => <span className="font-mono text-xs text-fg">{c.getValue()}</span> }),
  col.accessor("name", { header: "Tên", size: 280, meta: { wrap: true }, cell: (c) => <span className="block min-w-48 font-medium text-fg">{c.getValue()}</span> }),
  col.accessor("kindLabel", { header: "Loại", size: 170, meta: { filter: "select" } }),
  col.accessor("docLabel", { header: "Chứng từ", size: 180, cell: (c) => c.getValue() || <span className="text-fg-subtle">—</span> }),
  col.accessor("version", { header: "Phiên bản", size: 110, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">v{c.getValue()}</span> }),
  col.accessor("fieldCount", { header: "Số trường", size: 110, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("statusText", { header: "Phát hành", size: 160, meta: { filter: "select" }, cell: (c) => <StatusBadge status={status(c.row.original)} /> }),
  col.accessor("orgCount", { header: "Doanh nghiệp đang dùng", size: 190, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("updatedAt", { header: "Cập nhật", size: 140, cell: (c) => <span className="text-fg-muted">{formatRelative(c.getValue())}</span> }),
]);

export function SkillTemplatesPage() {
  const { can } = useAdminSession();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.skillTemplates, queryFn: listSkillTemplates });
  const [target, setTarget] = useState<SkillTemplate | null>(null);
  const publish = useAdminMutation({
    mutationFn: ({ t, reason }: { t: SkillTemplate; reason: string }) => setSkillTemplatePublished(t.id, { published: !t.published, reason }),
    success: (t) => (t.published ? `Đã phát hành ${t.code}` : `Đã ngừng phát hành ${t.code}`),
    errorTitle: "Không đổi được trạng thái phát hành",
    onSuccess: () => setTarget(null),
  });

  const rows = useMemo<Row[]>(
    () => (data ?? []).map((t) => ({ ...t, kindLabel: SKILL_KIND_LABELS[t.kind], docLabel: t.docKind ? DOC_KIND_LABELS[t.docKind] : "", statusText: statusLabel(status(t)) })),
    [data],
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title="Skill mẫu"
        description="Bộ skill do hệ thống cung cấp. Skill đã phát hành được cấp sẵn cho doanh nghiệp mới đăng ký; doanh nghiệp tự chỉnh bản của mình trong màn Cấu hình Skill AI."
      />
      <Alert tone="info">Màn này quyết định skill nào được phát hành. Soạn nội dung skill mẫu (trường, nhãn thay thế, chứng từ mẫu) chưa nằm trong phạm vi bản này.</Alert>
      {isError ? (
        <LoadError onRetry={() => void refetch()} title="Không tải được danh sách skill mẫu" />
      ) : (
        <DataTable
          aria-label="Skill mẫu"
          columns={COLUMNS}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.code}
          loading={isLoading}
          searchable
          pagination={false}
          emptyTitle="Chưa có skill mẫu"
          {...(can("PLATFORM")
            ? {
                rowActions: (r: Row) => (
                  <RowActions
                    rowLabel={r.code}
                    actions={[
                      r.published
                        ? { id: "unpublish", label: "Ngừng phát hành", icon: <CircleOff />, tone: "danger" as const, onSelect: () => setTarget(r) }
                        : { id: "publish", label: "Phát hành", icon: <Rocket />, onSelect: () => setTarget(r) },
                    ]}
                  />
                ),
              }
            : {})}
        />
      )}

      <ReasonDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.published ? "Ngừng phát hành skill mẫu?" : "Phát hành skill mẫu?"}
        icon={target?.published ? <CircleOff className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
        description={target ? `${target.code} v${target.version} · ${target.name}` : undefined}
        confirmLabel={target?.published ? "Ngừng phát hành" : "Phát hành"}
        tone={target?.published ? "danger" : "primary"}
        pending={publish.isPending}
        onConfirm={(reason) => target && publish.mutate({ t: target, reason })}
      >
        <Alert tone={target?.published ? "warning" : "info"}>
          {target?.published
            ? `Doanh nghiệp đăng ký mới sẽ không còn được cấp skill này. ${formatNumber(target.orgCount)} doanh nghiệp đang dùng vẫn giữ bản của họ.`
            : "Từ lúc phát hành, mọi doanh nghiệp đăng ký mới được cấp sẵn skill này. Doanh nghiệp hiện có không bị thay đổi."}
        </Alert>
      </ReasonDialog>
    </Stack>
  );
}
