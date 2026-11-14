"use client";
// Đổi bộ nguồn gốc / Áp dụng lại (spec 2026-11-14 §3): xem trước (số mặt hàng đổi ĐVT gốc / giữ nguyên / chưa có mã ở bộ này / thiếu hệ số + bảng
// mặt hàng thiếu hệ số), giải thích đổi gốc (hệ số tự tính lại, làm tròn 9 chữ số) → thực hiện. Còn mặt hàng thiếu hệ số: popup giữ mở; mở
// panel mặt hàng (popup tạm ẩn, giữ trạng thái) để thêm quy đổi rồi "Áp dụng lại" (cùng endpoint, idempotent). Quản trị/Chủ hoặc người phụ
// trách bộ đích – backend kiểm lại.
import type { CodeSet, SourceChangeBlockedItem } from "@kb/contracts";
import {
  Alert, Button, createDataTableColumnHelper, DataTable, Dialog, DialogContent, DialogFooter, fill, Grid, LoadingState, pickMessages, RowActions, Stack, StatCard, toast,
  useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, PackageOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { catalogKeys, changeSourceSet, previewSourceChange } from "@/api/catalog";
import { LoadError } from "@/components/common/load-error";
import { getFormatLocale } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import type { CatalogAccess } from "./catalog-access";
import { ItemPanel } from "./item-panel";
import { CATALOG_SOURCE_MESSAGES } from "./source-set.messages";

type Messages = (typeof CATALOG_SOURCE_MESSAGES)["vi"];
const col = createDataTableColumnHelper<SourceChangeBlockedItem>();

function buildColumns(t: Messages) {
  return col.columns([
    col.accessor("itemNo", { header: t.colItemNo, size: 130, meta: { sticky: true, hideable: false }, cell: (c) => <span className="font-mono text-fg">{c.getValue()}</span> }),
    col.accessor("name", { header: t.colName, size: 240, meta: { wrap: true }, cell: (c) => <span className="line-clamp-2 text-fg">{c.getValue()}</span> }),
    col.accessor("code", { header: t.colCode, size: 150, meta: { wrap: true }, cell: (c) => <span className="break-all font-mono text-fg">{c.getValue()}</span> }),
    col.accessor((r) => fill(t.units, { from: r.baseUnit ?? t.noUnit, to: r.newUnit ?? t.noUnit }), { id: "units", header: t.colUnits, size: 160 }),
  ]);
}

export function SetSourceDialog({ set, sets, access, onClose }: { set: CodeSet; sets: readonly CodeSet[]; access: CatalogAccess; onClose: () => void }) {
  const t = useMessages(CATALOG_SOURCE_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  /** Mặt hàng đang mở ở panel (popup tạm ẩn trong lúc đó). */
  const [openItem, setOpenItem] = useState<string | null>(null);
  /** Đã thực hiện mà còn mặt hàng thiếu hệ số → giữ popup để bổ sung rồi áp dụng lại. */
  const [applied, setApplied] = useState(false);
  const preview = useQuery({ queryKey: catalogKeys.sourcePreview(set.id), queryFn: () => previewSourceChange(set.id) });
  const columns = useMemo(() => buildColumns(pickMessages(CATALOG_SOURCE_MESSAGES, locale)), [locale]);
  const reapply = set.isSource || applied;
  const currentId = preview.data?.currentSourceId;
  const current = currentId && currentId !== set.id ? sets.find((s) => s.id === currentId) : undefined;

  const apply = useMutation({
    mutationFn: () => changeSourceSet(set.id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({
        tone: res.blocked.length ? "warning" : "success",
        title: fill(reapply ? t.doneReapply : t.done, { name: set.name }),
        description: [fill(t.doneRebased, { n: res.rebased }), ...(res.blocked.length ? [fill(t.doneBlocked, { n: res.blocked.length })] : [])].join(" "),
      });
      if (res.blocked.length) setApplied(true);
      else onClose();
    },
  });

  const blocked = preview.data?.blocked ?? [];
  const body = preview.isError ? (
    <LoadError title={t.loadError} onRetry={() => void preview.refetch()} />
  ) : !preview.data ? (
    <LoadingState size="sm" title={t.loading} />
  ) : (
    <Stack gap="md">
      {apply.isError && <Alert tone="danger">{errorText(apply.error, getFormatLocale(), t.applyFailed)}</Alert>}
      {applied && <Alert tone="warning" title={t.resultTitle}>{fill(t.doneBlocked, { n: blocked.length })}</Alert>}
      {current && <p className="text-sm text-fg">{fill(t.current, { name: current.name })}</p>}
      <Grid cols={{ base: 2, md: 4 }} gap="md">
        <StatCard label={t.statRebase} value={preview.data.rebaseCount} />
        <StatCard label={t.statUnchanged} value={preview.data.unchangedCount} />
        <StatCard label={t.statMissing} value={preview.data.missingCount} />
        <StatCard label={t.statBlocked} value={blocked.length} />
      </Grid>
      <p className="text-sm text-fg">{t.rebaseNote}</p>
      <p className="text-sm text-fg-muted">{t.keepNote}</p>
      {blocked.length > 0 && (
        <Stack gap="sm">
          {applied ? <p className="text-sm text-fg-muted">{t.blockedHint}</p> : <Alert tone="warning" title={fill(t.blockedTitle, { n: blocked.length })}>{t.blockedHint}</Alert>}
          <DataTable
            aria-label={t.blockedTable}
            columns={columns}
            data={blocked}
            getRowId={(r) => r.itemId}
            rowLabel={(r) => `${r.itemNo} ${r.name}`}
            pagination={blocked.length > 10 ? { mode: "client", initialPageSize: 10 } : false}
            onRowClick={(r) => setOpenItem(r.itemId)}
            rowActions={(r) => (
              <RowActions rowLabel={`${r.itemNo} ${r.name}`} actions={[{ id: "open", label: t.openItem, icon: <PackageOpen />, primary: true, onSelect: () => setOpenItem(r.itemId) }]} />
            )}
          />
        </Stack>
      )}
    </Stack>
  );

  return (
    <>
      <Dialog open={openItem === null} onOpenChange={(o) => !o && onClose()}>
        <DialogContent title={fill(reapply ? t.titleReapply : t.title, { name: set.name })} description={t.description} icon={<Crown className="h-4 w-4" />} size="lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (preview.data) apply.mutate();
            }}
          >
            {body}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>{applied ? t.close : t.cancel}</Button>
              <Button type="submit" loading={apply.isPending} disabled={!preview.data}>{reapply ? t.confirmReapply : t.confirm}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ItemPanel
        itemId={openItem}
        sets={sets}
        access={access}
        onOpenChange={(o) => {
          if (o) return;
          setOpenItem(null);
          // Vừa thêm quy đổi → tính lại danh sách thiếu hệ số.
          void qc.invalidateQueries({ queryKey: catalogKeys.sourcePreview(set.id) });
        }}
      />
    </>
  );
}
