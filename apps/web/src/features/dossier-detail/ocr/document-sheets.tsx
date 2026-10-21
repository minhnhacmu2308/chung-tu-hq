"use client";
// Bảng đọc theo từng chứng từ (STT | Tên trường | Trị giá) theo danh mục trường chuẩn + nút xuất Excel.
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, EmptyState, fill, pickMessages, SkeletonTable, Tabs, TabsContent, TabsList, TabsTrigger, toast, useUiLocale, type UiLocale } from "@kb/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import type { DocumentSheet } from "@kb/contracts";
import { listDocumentSheets, ocrKeys } from "@/api/ocr";
import { LoadError } from "@/components/common/load-error";
import { toastMutationError } from "@/lib/mutation-error";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { DOCUMENT_SHEETS_MESSAGES } from "./ocr.messages";

type Row = DocumentSheet["rows"][number];
const col = createDataTableColumnHelper<Row>();
const buildColumns = (locale: UiLocale) => {
  const t = pickMessages(DOCUMENT_SHEETS_MESSAGES, locale);
  return col.columns([
  col.accessor("stt", { header: t.colStt, meta: { align: "end" } }),
  col.accessor("label", { header: t.colLabel, meta: { wrap: true, hideable: false } }),
  col.accessor("value", { header: t.colValue, meta: { wrap: true }, cell: (c) => (c.getValue() ? <span className="whitespace-pre-line">{c.getValue()}</span> : <span className="text-fg-subtle">—</span>) }),
  ]);
};

/** Dựng file Excel ngay trên trình duyệt từ bảng đã tải → tiêu đề cột theo ngôn ngữ đang chọn (giá trị là dữ liệu chứng từ, giữ nguyên). */
async function buildXlsx(sheets: DocumentSheet[], locale: UiLocale): Promise<Blob> {
  const { buildDocumentSheetsWorkbook } = await import("@/lib/document-sheets-xlsx");
  return new Blob([await buildDocumentSheetsWorkbook(sheets, locale)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Thu hồi sau một nhịp: thu hồi ngay sau click làm Chrome hủy lượt tải.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DocumentSheetsCard({ dossierId, dossierCode }: { dossierId: string; dossierCode: string }) {
  const q = useQuery({ queryKey: ocrKeys.sheets(dossierId), queryFn: () => listDocumentSheets(dossierId) });
  const [tab, setTab] = useState<string | undefined>();
  const locale = useUiLocale();
  const t = pickMessages(DOCUMENT_SHEETS_MESSAGES, locale);
  const kindLabels = pickMessages(DOC_KIND_LABELS, locale);
  const columns = useMemo(() => buildColumns(locale), [locale]);
  const exportXlsx = useMutation({
    mutationFn: () => buildXlsx(q.data ?? [], locale),
    onSuccess: (blob) => {
      saveBlob(blob, `${dossierCode}-bang-doc-chung-tu.xlsx`);
      toast({ tone: "success", title: t.exported });
    },
    onError: toastMutationError(t.exportFailed),
  });
  const sheets = q.data ?? [];
  const current = tab && sheets.some((s) => s.documentId === tab) ? tab : sheets[0]?.documentId;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<FileSpreadsheet className="h-4 w-4" />} loading={exportXlsx.isPending} disabled={!sheets.length} onClick={() => exportXlsx.mutate()}>
          {t.exportExcel}
        </Button>
      </CardHeader>
      <CardContent>
        {q.isError ? (
          <LoadError onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <SkeletonTable rows={6} />
        ) : !sheets.length ? (
          <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
        ) : (
          <Tabs value={current ?? ""} onValueChange={setTab}>
            <TabsList aria-label={t.tabsLabel}>
              {sheets.map((s) => <TabsTrigger key={s.documentId} value={s.documentId}>{kindLabels[s.kind]}</TabsTrigger>)}
            </TabsList>
            {sheets.map((s) => (
              <TabsContent key={s.documentId} value={s.documentId} className="pt-4">
                <p className="mb-2 truncate text-sm text-fg-muted">{s.fileName}</p>
                <DataTable aria-label={fill(t.tableLabel, { file: s.fileName })} columns={columns} data={s.rows} getRowId={(r) => r.key} searchable pagination={false} emptyTitle={t.noFields} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
