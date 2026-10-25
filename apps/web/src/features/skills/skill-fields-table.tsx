"use client";
// Bảng trường của skill: khách tự chọn trường nào AI trích xuất, trường nào hiện trên màn kiểm tra.
import {
  Alert, Badge, Button, createDataTableColumnHelper, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Stack, Switch, toast, RowActions, fill, pickMessages, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { resolveSkillFieldKey } from "@kb/contracts";
import { useMemo, useState } from "react";
import { removeSkillField, skillKeys, updateSkillField, type SkillFieldPatch } from "@/api/skills";
import type { Skill, SkillField } from "@/mocks/types";
import { FieldDialog } from "./field-dialog";
import { FIELD_TYPE_LABELS } from "./skill-display";
import { FIELDS_TABLE_MESSAGES } from "./skills.messages";

const col = createDataTableColumnHelper<SkillField>();

function useFieldMutation(skill: Skill) {
  const t = useMessages(FIELDS_TABLE_MESSAGES);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: SkillFieldPatch }) => updateSkillField(skill.id, key, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
    onError: (e: Error) => toast({ tone: "danger", title: t.saveError, description: e.message }),
  });
}

export function SkillFieldsTable({ skill }: { skill: Skill }) {
  const locale = useUiLocale();
  const t = useMessages(FIELDS_TABLE_MESSAGES);
  const qc = useQueryClient();
  // Trường thuộc danh mục chuẩn của loại chứng từ không xóa được; trường còn lại là trường bổ sung riêng (AI đọc vào `custom`).
  const isStandard = (f: SkillField) => !!skill.docKind && resolveSkillFieldKey(skill.docKind, f.key).standard;
  const update = useFieldMutation(skill);
  const [editing, setEditing] = useState<SkillField | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const remove = useMutation({
    mutationFn: (key: string) => removeSkillField(skill.id, key),
    onSuccess: (_s, key) => {
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      toast({ tone: "success", title: fill(t.removed, { key }) });
    },
  });

  const openDialog = (f?: SkillField) => {
    setEditing(f);
    setDialogOpen(true);
  };

  const columns = useMemo(() => {
    const t = pickMessages(FIELDS_TABLE_MESSAGES, locale);
    const types = pickMessages(FIELD_TYPE_LABELS, locale);
    const code = col.accessor("key", {
      header: t.colKey,
      meta: { hideable: false },
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    });
    const label = col.accessor("label", { header: t.colLabel, meta: { wrap: true } });
    const group = col.accessor((f) => (isStandard(f) ? t.standardBadge : t.customBadge), {
      id: "group",
      header: t.colGroup,
      cell: (c) => (isStandard(c.row.original) ? <Badge tone="neutral">{t.standardBadge}</Badge> : <Badge tone="primary">{t.customBadge}</Badge>),
    });
    const required = col.accessor("required", {
      header: t.colRequired,
      cell: (c) => (c.getValue() ? <Badge tone="warning">{t.required}</Badge> : <span className="text-fg-subtle">{t.no}</span>),
    });

    return col.columns([
      code,
      label,
      group,
      col.accessor((f) => types[f.type], { id: "type", header: t.colType }),
      required,
      col.accessor((f) => f.aliases.join(" "), {
        id: "aliases",
        header: t.colAliases,
        meta: { wrap: true },
        cell: (c) => (
          <div className="flex min-w-56 flex-wrap gap-1">
            {c.row.original.aliases.length ? c.row.original.aliases.map((a) => <Badge key={a} tone="neutral" variant="outline">{a}</Badge>) : <span className="text-fg-subtle">—</span>}
          </div>
        ),
      }),
      col.accessor((f) => f.declarationField ?? "", {
        id: "decl",
        header: t.colDecl,
        meta: { wrap: true },
        cell: (c) => (c.getValue() ? <span className="text-fg">{c.getValue()}</span> : <span className="text-fg-subtle">{t.crossCheckOnly}</span>),
      }),
      col.accessor("extract", {
        header: t.colExtract,
        enableSorting: false,
        cell: (c) => {
          const f = c.row.original;
          return (
            <Switch
              checked={f.extract}
              disabled={f.required || update.isPending}
              onCheckedChange={(v) => update.mutate({ key: f.key, patch: { extract: v } })}
              aria-label={fill(t.extractAria, { label: f.label })}
            />
          );
        },
      }),
      col.accessor("display", {
        header: t.colDisplay,
        enableSorting: false,
        cell: (c) => {
          const f = c.row.original;
          return (
            <Switch
              checked={f.display}
              disabled={!f.extract || update.isPending}
              onCheckedChange={(v) => update.mutate({ key: f.key, patch: { display: v } })}
              aria-label={fill(t.displayAria, { label: f.label })}
            />
          );
        },
      }),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill.docKind, update.isPending, locale]);

  const extracted = skill.fields.filter((f) => f.extract).length;
  const shown = skill.fields.filter((f) => f.display).length;

  return (
    <Stack gap="md">
      <Alert tone="info" title={t.infoTitle}>
        <b>{t.infoStandard}</b>{t.infoStandardBody}<b>{t.infoCustom}</b>{t.infoCustomBody}<b>{t.infoExtract}</b>{t.infoExtractBody}<b>{t.infoDisplay}</b>{t.infoDisplayBody}
      </Alert>
      <DataTable
        aria-label={t.tableAria}
        columns={columns}
        data={skill.fields}
        getRowId={(f) => f.key}
        rowLabel={(f) => f.key}
        rowActions={(f) => (
          <RowActions
            rowLabel={f.key}
            actions={[
              { id: "edit", label: t.edit, icon: <Pencil />, onSelect: () => openDialog(f) },
              {
                id: "remove",
                label: isStandard(f) ? t.removeStandard : t.remove,
                icon: <Trash2 />,
                tone: "danger",
                disabled: isStandard(f),
                onSelect: () => remove.mutate(f.key),
              },
            ]}
          />
        )}
        searchable
        columnToggle
        pagination={false}
        toolbarActions={
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => openDialog()}>
            {t.addCustom}
          </Button>
        }
        emptyTitle={t.emptyTitle}
        emptyDescription={t.emptyDescription}
      />
      <p className="text-sm text-fg-muted">
        {fill(t.summary, { total: skill.fields.length, extracted, shown })}
      </p>
      <FieldDialog
        skill={skill}
        field={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(m) => toast({ tone: "success", title: m })}
      />
    </Stack>
  );
}
