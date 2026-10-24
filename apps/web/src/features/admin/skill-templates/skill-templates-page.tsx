"use client";
import type { SkillTemplate } from "@kb/contracts";
import { Alert, createDataTableColumnHelper, DataTable, fill, PageHeader, RowActions, Stack, StatusBadge, useMessages, useUiLocale } from "@kb/ui";
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
import { SKILL_TEMPLATES_MESSAGES } from "./skill-templates-page.messages";

type SkillMessages = (typeof SKILL_TEMPLATES_MESSAGES)["vi"];

type Row = SkillTemplate & { kindLabel: string; docLabel: string; statusText: string };
const status = (t: SkillTemplate) => (t.published ? ("TEMPLATE_PUBLISHED" as const) : ("TEMPLATE_DRAFT" as const));

const col = createDataTableColumnHelper<Row>();
const makeColumns = (m: SkillMessages) => col.columns([
  col.accessor("code", { header: m.colCode, size: 150, meta: { hideable: false, sticky: true }, cell: (c) => <span className="font-mono text-xs text-fg">{c.getValue()}</span> }),
  col.accessor("name", { header: m.colName, size: 280, meta: { wrap: true }, cell: (c) => <span className="block min-w-48 font-medium text-fg">{c.getValue()}</span> }),
  col.accessor("kindLabel", { header: m.colKind, size: 170, meta: { filter: "select" } }),
  col.accessor("docLabel", { header: m.colDoc, size: 180, cell: (c) => c.getValue() || <span className="text-fg-subtle">—</span> }),
  col.accessor("version", { header: m.colVersion, size: 110, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">v{c.getValue()}</span> }),
  col.accessor("fieldCount", { header: m.colFields, size: 110, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("statusText", { header: m.colPublish, size: 160, meta: { filter: "select" }, cell: (c) => <StatusBadge status={status(c.row.original)} /> }),
  col.accessor("orgCount", { header: m.colOrgs, size: 190, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("updatedAt", { header: m.colUpdated, size: 140, cell: (c) => <span className="text-fg-muted">{formatRelative(c.getValue())}</span> }),
]);

export function SkillTemplatesPage() {
  const m = useMessages(SKILL_TEMPLATES_MESSAGES);
  const kindLabels = useMessages(SKILL_KIND_LABELS);
  const docLabels = useMessages(DOC_KIND_LABELS);
  const locale = useUiLocale();
  const columns = useMemo(() => makeColumns(m), [m]);
  const { can } = useAdminSession();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.skillTemplates, queryFn: listSkillTemplates });
  const [target, setTarget] = useState<SkillTemplate | null>(null);
  const publish = useAdminMutation({
    mutationFn: ({ t, reason }: { t: SkillTemplate; reason: string }) => setSkillTemplatePublished(t.id, { published: !t.published, reason }),
    success: (t) => fill(t.published ? m.published : m.unpublished, { code: t.code }),
    errorTitle: m.errorTitle,
    onSuccess: () => setTarget(null),
  });

  const rows = useMemo<Row[]>(
    () => (data ?? []).map((t) => ({ ...t, kindLabel: kindLabels[t.kind], docLabel: t.docKind ? docLabels[t.docKind] : "", statusText: statusLabel(status(t), locale) })),
    [data, kindLabels, docLabels, locale],
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title={m.title}
        description={m.description}
      />
      <Alert tone="info">{m.scopeInfo}</Alert>
      {isError ? (
        <LoadError onRetry={() => void refetch()} title={m.loadError} />
      ) : (
        <DataTable
          aria-label={m.tableLabel}
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.code}
          loading={isLoading}
          searchable
          pagination={false}
          emptyTitle={m.empty}
          {...(can("PLATFORM")
            ? {
                rowActions: (r: Row) => (
                  <RowActions
                    rowLabel={r.code}
                    actions={[
                      r.published
                        ? { id: "unpublish", label: m.unpublish, icon: <CircleOff />, tone: "danger" as const, onSelect: () => setTarget(r) }
                        : { id: "publish", label: m.publish, icon: <Rocket />, onSelect: () => setTarget(r) },
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
        title={target?.published ? m.unpublishTitle : m.publishTitle}
        icon={target?.published ? <CircleOff className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
        description={target ? `${target.code} v${target.version} · ${target.name}` : undefined}
        confirmLabel={target?.published ? m.unpublish : m.publish}
        tone={target?.published ? "danger" : "primary"}
        pending={publish.isPending}
        onConfirm={(reason) => target && publish.mutate({ t: target, reason })}
      >
        <Alert tone={target?.published ? "warning" : "info"}>
          {target?.published
            ? fill(m.unpublishWarn, { n: formatNumber(target.orgCount) })
            : m.publishInfo}
        </Alert>
      </ReasonDialog>
    </Stack>
  );
}
