"use client";
// Bảng trường của skill: khách tự chọn trường nào AI trích xuất, trường nào hiện trên màn kiểm tra.
import {
  Alert, Badge, Button, createDataTableColumnHelper, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Stack, Switch, toast, RowActions,
} from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { resolveSkillFieldKey } from "@kb/contracts";
import { useMemo, useState } from "react";
import { removeSkillField, skillKeys, updateSkillField, type SkillFieldPatch } from "@/api/skills";
import type { Skill, SkillField } from "@/mocks/types";
import { FieldDialog } from "./field-dialog";
import { FIELD_TYPE_LABELS } from "./skill-display";

const col = createDataTableColumnHelper<SkillField>();

function useFieldMutation(skill: Skill) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: SkillFieldPatch }) => updateSkillField(skill.id, key, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
    onError: (e: Error) => toast({ tone: "danger", title: "Không lưu được", description: e.message }),
  });
}

export function SkillFieldsTable({ skill }: { skill: Skill }) {
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
      toast({ tone: "success", title: `Đã xóa trường ${key}` });
    },
  });

  const openDialog = (f?: SkillField) => {
    setEditing(f);
    setDialogOpen(true);
  };

  const columns = useMemo(() => {
    const actions = col.display({
      id: "actions",
      header: () => <span className="sr-only">Thao tác</span>,
      meta: { align: "end", sticky: "end" },
      cell: (c) => (
        <RowActions
          rowLabel={c.row.original.key}
          actions={[
            { id: "edit", label: "Sửa", icon: <Pencil />, onSelect: () => openDialog(c.row.original) },
            {
              id: "remove",
              label: isStandard(c.row.original) ? "Trường chuẩn – tắt Trích xuất thay vì xóa" : "Xóa",
              icon: <Trash2 />,
              tone: "danger",
              disabled: isStandard(c.row.original),
              onSelect: () => remove.mutate(c.row.original.key),
            },
          ]}
        />
      ),
    });
    const code = col.accessor("key", {
      header: "Mã trường",
      meta: { hideable: false },
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    });
    const label = col.accessor("label", { header: "Tên hiển thị", meta: { wrap: true } });
    const group = col.accessor((f) => (isStandard(f) ? "Chuẩn" : "Bổ sung"), {
      id: "group",
      header: "Nhóm",
      cell: (c) => (c.getValue() === "Chuẩn" ? <Badge tone="neutral">Trường chuẩn</Badge> : <Badge tone="primary">Trường bổ sung</Badge>),
    });
    const required = col.accessor("required", {
      header: "Bắt buộc",
      cell: (c) => (c.getValue() ? <Badge tone="warning">Bắt buộc</Badge> : <span className="text-fg-subtle">Không</span>),
    });

    return col.columns([
      code,
      label,
      group,
      col.accessor((f) => FIELD_TYPE_LABELS[f.type], { id: "type", header: "Kiểu" }),
      required,
      col.accessor((f) => f.aliases.join(" "), {
        id: "aliases",
        header: "Nhãn thường gặp (alias)",
        meta: { wrap: true },
        cell: (c) => (
          <div className="flex min-w-56 flex-wrap gap-1">
            {c.row.original.aliases.length ? c.row.original.aliases.map((a) => <Badge key={a} tone="neutral" variant="outline">{a}</Badge>) : <span className="text-fg-subtle">—</span>}
          </div>
        ),
      }),
      col.accessor((f) => f.declarationField ?? "", {
        id: "decl",
        header: "Ánh xạ tờ khai",
        meta: { wrap: true },
        cell: (c) => (c.getValue() ? <span className="text-fg">{c.getValue()}</span> : <span className="text-fg-subtle">Chỉ đối chiếu</span>),
      }),
      col.accessor("extract", {
        header: "Trích xuất",
        enableSorting: false,
        cell: (c) => {
          const f = c.row.original;
          return (
            <Switch
              checked={f.extract}
              disabled={f.required || update.isPending}
              onCheckedChange={(v) => update.mutate({ key: f.key, patch: { extract: v } })}
              aria-label={`Trích xuất ${f.label}`}
            />
          );
        },
      }),
      col.accessor("display", {
        header: "Hiển thị",
        enableSorting: false,
        cell: (c) => {
          const f = c.row.original;
          return (
            <Switch
              checked={f.display}
              disabled={!f.extract || update.isPending}
              onCheckedChange={(v) => update.mutate({ key: f.key, patch: { display: v } })}
              aria-label={`Hiển thị ${f.label}`}
            />
          );
        },
      }),
      actions,
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill.docKind, update.isPending]);

  const extracted = skill.fields.filter((f) => f.extract).length;
  const shown = skill.fields.filter((f) => f.display).length;

  return (
    <Stack gap="md">
      <Alert tone="info" title="Trường chuẩn + trường bổ sung riêng">
        <b>Trường chuẩn</b> giống nhau cho mọi khách hàng (bảng đọc chứng từ, dựng tờ khai) – chỉ sửa nhãn thường gặp và bật/tắt. <b>Trường bổ sung</b> do doanh nghiệp thêm (tối đa 20), AI đọc thật và hiện ở màn kiểm tra, bảng đọc chứng từ. Tắt <b>Trích xuất</b>: AI không đọc trường đó; tắt <b>Hiển thị</b>: vẫn đọc để đối chiếu nhưng ẩn khỏi màn kiểm tra.
      </Alert>
      <DataTable
        aria-label="Trường dữ liệu"
        columns={columns}
        data={skill.fields}
        getRowId={(f) => f.key}
        searchable
        columnToggle
        pagination={false}
        toolbarActions={
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => openDialog()}>
            Thêm trường bổ sung
          </Button>
        }
        emptyTitle="Chưa có trường"
        emptyDescription="Thêm trường đầu tiên để AI biết cần đọc gì."
      />
      <p className="text-sm text-fg-muted">
        {skill.fields.length} trường · {extracted} được trích xuất · {shown} hiển thị trên màn kiểm tra
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
