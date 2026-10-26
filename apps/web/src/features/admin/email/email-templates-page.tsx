"use client";
// Mẫu email kéo thả: danh sách, tạo / sửa / nhân bản / xóa, dùng mẫu để gửi.
import type { EmailTemplate } from "@kb/contracts";
import { Button, ConfirmDialog, createDataTableColumnHelper, DataTable, fill, PageHeader, RowActions, Stack, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { adminKeys, deleteEmailTemplate, listEmailTemplates, saveEmailTemplate } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { cloneBlocks } from "./email-builder";
import { EMAIL_PAGES_MESSAGES } from "./email.messages";

type M = Record<keyof (typeof EMAIL_PAGES_MESSAGES)["vi"], string>;
const col = createDataTableColumnHelper<EmailTemplate>();
const makeColumns = (t: M) =>
  col.columns([
    col.accessor("name", {
      header: t.colName,
      size: 280,
      meta: { wrap: true, hideable: false },
      cell: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-fg">{c.getValue()}</span>
          {c.row.original.description && <span className="text-xs text-fg-muted">{c.row.original.description}</span>}
        </div>
      ),
    }),
    col.accessor("subject", { header: t.colSubject, size: 320, meta: { wrap: true } }),
    col.accessor("updatedAt", {
      header: t.colUpdated,
      size: 180,
      cell: (c) => (
        <div className="flex flex-col">
          <time dateTime={c.getValue()} title={formatDateTime(c.getValue())}>{formatRelative(c.getValue())}</time>
          <span className="text-xs text-fg-muted">{c.row.original.updatedByName}</span>
        </div>
      ),
    }),
  ]);

export function EmailTemplatesPage() {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  const router = useRouter();
  const { can } = useAdminSession();
  const columns = useMemo(() => makeColumns(t), [t]);
  const q = useQuery({ queryKey: adminKeys.emailTemplates, queryFn: listEmailTemplates });
  const [toDelete, setToDelete] = useState<EmailTemplate | null>(null);
  const remove = useAdminMutation({ mutationFn: (id: string) => deleteEmailTemplate(id), success: () => t.templateDeleted, errorTitle: t.saveFailed, onSuccess: () => setToDelete(null) });
  const duplicate = useAdminMutation({
    mutationFn: (x: EmailTemplate) =>
      saveEmailTemplate(null, { name: fill(t.copyOf, { name: x.name }), subject: x.subject, blocks: cloneBlocks(x.blocks), ...(x.preheader ? { preheader: x.preheader } : {}), ...(x.description ? { description: x.description } : {}) }),
    success: () => t.saved,
    errorTitle: t.saveFailed,
    onSuccess: (x) => router.push(`/admin/email/templates/${x.id}`),
  });
  const edit = can("SUPPORT");
  return (
    <Stack gap="lg">
      <PageHeader
        title={t.templatesTitle}
        description={t.templatesDesc}
        actions={edit && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => router.push("/admin/email/templates/new")}>{t.newTemplate}</Button>}
      />
      {q.isError ? (
        <LoadError onRetry={() => void q.refetch()} title={t.loadError} />
      ) : (
        <DataTable
          aria-label={t.templatesTitle}
          columns={columns}
          data={q.data ?? []}
          getRowId={(x) => x.id}
          rowLabel={(x) => x.name}
          loading={q.isLoading}
          searchable
          onRowClick={(x) => router.push(`/admin/email/templates/${x.id}`)}
          emptyTitle={t.noTemplates}
          emptyDescription={t.noTemplatesDesc}
          rowActions={(x) => (
            <RowActions
              rowLabel={x.name}
              actions={[
                ...(edit ? [{ id: "use", label: t.useTemplate, icon: <Send />, onSelect: () => router.push(`/admin/email/compose?template=${encodeURIComponent(x.id)}`) }] : []),
                { id: "edit", label: t.editTemplate, icon: <Pencil />, onSelect: () => router.push(`/admin/email/templates/${x.id}`) },
                ...(edit
                  ? [
                      { id: "dup", label: t.duplicateTemplate, icon: <Copy />, quick: false, onSelect: () => duplicate.mutate(x) },
                      { id: "del", label: t.deleteTemplate, icon: <Trash2 />, tone: "danger" as const, quick: false, onSelect: () => setToDelete(x) },
                    ]
                  : []),
              ]}
            />
          )}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t.deleteTemplateTitle}
        icon={<Trash2 className="h-4 w-4" />}
        subject={toDelete?.name}
        confirmLabel={t.deleteTemplate}
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      >
        {fill(t.deleteTemplateBody, { name: toDelete?.name ?? "" })}
      </ConfirmDialog>
    </Stack>
  );
}
