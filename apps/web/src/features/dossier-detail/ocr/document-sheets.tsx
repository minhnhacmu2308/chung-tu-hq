"use client";
// Bảng đọc theo từng chứng từ (STT | Tên trường | Trị giá) theo danh mục trường chuẩn + nút xuất Excel.
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, EmptyState, SkeletonTable, Tabs, TabsContent, TabsList, TabsTrigger, toast } from "@kb/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import type { DocumentSheet } from "@kb/contracts";
import { downloadDocumentSheets, listDocumentSheets, ocrKeys } from "@/api/ocr";
import { LoadError } from "@/components/common/load-error";
import { toastMutationError } from "@/lib/mutation-error";
import { DOC_KIND_LABELS } from "@/mocks/types";

type Row = DocumentSheet["rows"][number];
const col = createDataTableColumnHelper<Row>();
const COLUMNS = col.columns([
  col.accessor("stt", { header: "STT", meta: { align: "end" } }),
  col.accessor("label", { header: "Tên trường", meta: { wrap: true, hideable: false } }),
  col.accessor("value", { header: "Trị giá", meta: { wrap: true }, cell: (c) => (c.getValue() ? <span className="whitespace-pre-line">{c.getValue()}</span> : <span className="text-fg-subtle">—</span>) }),
]);

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
  const exportXlsx = useMutation({
    mutationFn: () => downloadDocumentSheets(dossierId),
    onSuccess: (blob) => {
      saveBlob(blob, `${dossierCode}-bang-doc-chung-tu.xlsx`);
      toast({ tone: "success", title: "Đã xuất Excel bảng đọc chứng từ" });
    },
    onError: toastMutationError("Không xuất được Excel"),
  });
  const sheets = q.data ?? [];
  const current = tab && sheets.some((s) => s.documentId === tab) ? tab : sheets[0]?.documentId;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Bảng đọc chứng từ</CardTitle>
          <CardDescription>Theo danh mục trường chuẩn của từng loại chứng từ – giống bảng người khai lập tay, dùng để đối chiếu và lưu hồ sơ.</CardDescription>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<FileSpreadsheet className="h-4 w-4" />} loading={exportXlsx.isPending} disabled={!sheets.length} onClick={() => exportXlsx.mutate()}>
          Xuất Excel
        </Button>
      </CardHeader>
      <CardContent>
        {q.isError ? (
          <LoadError onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <SkeletonTable rows={6} />
        ) : !sheets.length ? (
          <EmptyState title="Chưa có chứng từ đọc xong" description="Bảng đọc hiện khi AI đọc xong ít nhất một chứng từ." />
        ) : (
          <Tabs value={current ?? ""} onValueChange={setTab}>
            <TabsList aria-label="Bảng đọc theo chứng từ">
              {sheets.map((s) => <TabsTrigger key={s.documentId} value={s.documentId}>{DOC_KIND_LABELS[s.kind]}</TabsTrigger>)}
            </TabsList>
            {sheets.map((s) => (
              <TabsContent key={s.documentId} value={s.documentId} className="pt-4">
                <p className="mb-2 truncate text-sm text-fg-muted">{s.fileName}</p>
                <DataTable aria-label={`Bảng đọc ${s.fileName}`} columns={COLUMNS} data={s.rows} getRowId={(r) => r.key} searchable pagination={false} emptyTitle="Không có trường" />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
