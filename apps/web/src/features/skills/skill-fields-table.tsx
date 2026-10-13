"use client";
// Bảng trường của skill: khách tự chọn trường nào AI trích xuất, trường nào hiện trên màn kiểm tra.
import {
  Alert, Badge, Button, createDataTableColumnHelper, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Stack, Switch, toast, RowActions,
} from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
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

const SOURCES = ["Invoice", "B/L", "AWB", "Packing List", "C/O", "Hóa đơn cước", "Arrival Notice", "Hồ sơ", "Hệ thống", "Tài khoản"];

/** Nguồn chính của quy tắc = nguồn được nhắc đầu tiên: "Invoice › Người bán" → "Invoice". */
function ruleSource(rule: string | undefined): string {
  if (!rule) return "—";
  let best = { name: "Hồ sơ", at: Infinity };
  for (const name of SOURCES) {
    const at = rule.indexOf(name);
    if (at >= 0 && at < best.at) best = { name, at };
  }
  return best.name;
}

export function SkillFieldsTable({ skill }: { skill: Skill }) {
  const qc = useQueryClient();
  const mapping = skill.kind === "MAPPING";
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
              label: c.row.original.required ? "Trường bắt buộc – không xóa được" : "Xóa",
              icon: <Trash2 />,
              tone: "danger",
              disabled: c.row.original.required,
              onSelect: () => remove.mutate(c.row.original.key),
            },
          ]}
        />
      ),
    });
    const code = col.accessor("key", {
      header: mapping ? "Mã chỉ tiêu" : "Mã trường",
      meta: { hideable: false },
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    });
    const label = col.accessor("label", { header: mapping ? "Chỉ tiêu tờ khai" : "Tên hiển thị", meta: { wrap: true } });
    const required = col.accessor("required", {
      header: "Bắt buộc",
      cell: (c) => (c.getValue() ? <Badge tone="warning">Bắt buộc</Badge> : <span className="text-fg-subtle">Không</span>),
    });

    if (mapping) {
      return col.columns([
        code,
        label,
        col.accessor((f) => ruleSource(f.declarationField), { id: "source", header: "Nguồn", cell: (c) => <Badge tone="info">{c.getValue()}</Badge> }),
        col.accessor((f) => f.declarationField ?? "", {
          id: "rule",
          header: "Quy tắc lấy giá trị",
          meta: { wrap: true },
          cell: (c) => <span className="text-fg-muted">{c.getValue() || "—"}</span>,
        }),
        required,
        actions,
      ]);
    }

    return col.columns([
      code,
      label,
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
  }, [mapping, update.isPending]);

  const extracted = skill.fields.filter((f) => f.extract).length;
  const shown = skill.fields.filter((f) => f.display).length;

  return (
    <Stack gap="md">
      {mapping ? (
        <Alert tone="info" title="Ánh xạ là quy tắc cố định, không dùng AI">
          Mỗi dòng quy định một chỉ tiêu tờ khai lấy giá trị từ đâu. Kết quả giống nhau mọi lần chạy và được kiểm bằng test – đổi quy tắc chỉ áp dụng cho hồ sơ tạo sau khi lưu.
        </Alert>
      ) : (
        <Alert tone="info" title="Doanh nghiệp tự chọn trường cần lấy">
          Tắt <b>Trích xuất</b>: AI không đọc trường đó (nhanh và rẻ hơn). Tắt <b>Hiển thị</b>: vẫn đọc để đối chiếu chéo nhưng ẩn khỏi màn kiểm tra. Trường bắt buộc của tờ khai luôn được trích xuất.
        </Alert>
      )}
      <DataTable
        aria-label={mapping ? "Quy tắc ánh xạ" : "Trường dữ liệu"}
        columns={columns}
        data={skill.fields}
        getRowId={(f) => f.key}
        searchable
        columnToggle
        pagination={false}
        toolbarActions={
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => openDialog()}>
            {mapping ? "Thêm chỉ tiêu" : "Thêm trường"}
          </Button>
        }
        emptyTitle="Chưa có trường"
        emptyDescription="Thêm trường đầu tiên để AI biết cần đọc gì."
      />
      {!mapping && (
        <p className="text-sm text-fg-muted">
          {skill.fields.length} trường · {extracted} được trích xuất · {shown} hiển thị trên màn kiểm tra
        </p>
      )}
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
