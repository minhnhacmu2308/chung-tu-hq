"use client";
// Thêm / sửa một trường của skill (hoặc một quy tắc của skill ánh xạ).
import { Alert, Button, Checkbox, Dialog, DialogContent, DialogFooter, Field, Grid, Input, Select, Stack } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { addSkillField, skillKeys, updateSkillField } from "@/api/skills";
import type { Skill, SkillField } from "@/mocks/types";
import { FIELD_TYPE_LABELS } from "./skill-display";

type Props = {
  skill: Skill;
  /** Có = sửa trường này; không = thêm mới. */
  field?: SkillField | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
};

const EMPTY: SkillField = { key: "", label: "", type: "string", required: false, aliases: [], extract: true, display: true };
const TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABELS) as SkillField["type"][]).map((v) => ({ value: v, label: FIELD_TYPE_LABELS[v] }));

export function FieldDialog({ skill, field, open, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const mapping = skill.kind === "MAPPING";
  const [draft, setDraft] = useState<SkillField>(field ?? EMPTY);
  const [aliases, setAliases] = useState((field?.aliases ?? []).join(", "));

  useEffect(() => {
    if (open) {
      setDraft(field ?? EMPTY);
      setAliases((field?.aliases ?? []).join(", "));
    }
  }, [open, field]);

  const save = useMutation({
    mutationFn: () => {
      const parsedAliases = aliases.split(/[,|]/).map((a) => a.trim()).filter(Boolean);
      const decl = draft.declarationField?.trim();
      if (field) {
        return updateSkillField(skill.id, field.key, {
          label: draft.label.trim(),
          required: draft.required,
          aliases: parsedAliases,
          declarationField: decl ?? "",
        });
      }
      const { declarationField: _omit, ...rest } = draft;
      return addSkillField(skill.id, { ...rest, aliases: parsedAliases, ...(decl ? { declarationField: decl } : {}) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      onOpenChange(false);
      onSaved(field ? `Đã lưu "${draft.label}"` : `Đã thêm "${draft.label}"`);
    },
  });

  const title = mapping ? (field ? `Sửa quy tắc ${field.key}` : "Thêm chỉ tiêu") : field ? `Sửa trường ${field.key}` : "Thêm trường";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={
          mapping
            ? "Quy tắc là cấu hình chạy bằng code – thay đổi có hiệu lực từ hồ sơ tạo sau khi lưu."
            : "Trường mới được dùng từ lần đọc tiếp theo. Nên thêm vài mẫu đã gắn nhãn rồi bấm Đánh giá lại."
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Stack gap="md">
            {save.isError && <Alert tone="danger">{save.error.message}</Alert>}
            <Grid cols={{ base: 1, md: 2 }}>
              <Field label={mapping ? "Mã chỉ tiêu" : "Mã trường"} required hint={field ? "Không đổi được mã sau khi tạo" : "Chữ không dấu, số, dấu _"}>
                <Input
                  value={draft.key}
                  disabled={!!field}
                  className="font-mono"
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  placeholder={mapping ? "PVC" : "container_no"}
                />
              </Field>
              <Field label={mapping ? "Tên chỉ tiêu" : "Tên hiển thị"} required>
                <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={mapping ? "Phí vận chuyển" : "Số container"} />
              </Field>
              {!mapping && (
                <Field label="Kiểu dữ liệu">
                  <Select
                    options={TYPE_OPTIONS}
                    value={draft.type}
                    disabled={!!field}
                    onChange={(e) => setDraft({ ...draft, type: e.target.value as SkillField["type"] })}
                  />
                </Field>
              )}
              {!mapping && (
                <Field label="Nhãn thường gặp trên chứng từ (alias)" hint="Cách nhau bằng dấu phẩy" className="md:col-span-2">
                  <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Container No., CNTR No., Số cont" />
                </Field>
              )}
              <Field
                label={mapping ? "Quy tắc lấy giá trị" : "Ánh xạ chỉ tiêu tờ khai"}
                hint={mapping ? "Dạng: Chứng từ › Trường; ghi chú điều kiện nếu có" : "Bỏ trống nếu chỉ dùng để đối chiếu"}
                className="md:col-span-2"
              >
                <Input
                  value={draft.declarationField ?? ""}
                  onChange={(e) => setDraft({ ...draft, declarationField: e.target.value })}
                  placeholder={mapping ? "Hóa đơn cước › Cước quốc tế" : "Số hiệu container"}
                />
              </Field>
            </Grid>
            <Checkbox
              label={mapping ? "Bắt buộc có giá trị trước khi truyền" : "Bắt buộc – thiếu thì đánh dấu nghi ngờ"}
              checked={draft.required}
              onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            />
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" loading={save.isPending}>{field ? "Lưu" : "Thêm"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
