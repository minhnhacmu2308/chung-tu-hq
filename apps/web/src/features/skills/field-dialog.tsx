"use client";
// Thêm / sửa một trường của skill (hoặc một quy tắc của skill ánh xạ).
import { Alert, Button, Checkbox, Dialog, DialogContent, DialogFooter, Field, Grid, Input, Select, Stack, fill, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { addSkillField, skillKeys, updateSkillField } from "@/api/skills";
import type { Skill, SkillField } from "@/mocks/types";
import { FIELD_TYPE_LABELS } from "./skill-display";
import { FIELD_DIALOG_MESSAGES } from "./skills.messages";

type Props = {
  skill: Skill;
  /** Có = sửa trường này; không = thêm mới. */
  field?: SkillField | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
};

const EMPTY: SkillField = { key: "", label: "", type: "string", required: false, aliases: [], extract: true, display: true };

export function FieldDialog({ skill, field, open, onOpenChange, onSaved }: Props) {
  const t = useMessages(FIELD_DIALOG_MESSAGES);
  const typeLabels = useMessages(FIELD_TYPE_LABELS);
  const typeOptions = (Object.keys(typeLabels) as SkillField["type"][]).map((v) => ({ value: v, label: typeLabels[v] }));
  const qc = useQueryClient();
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
      onSaved(fill(field ? t.saved : t.added, { label: draft.label }));
    },
  });

  const title = field ? fill(t.editTitle, { key: field.key }) : t.addTitle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={t.description}
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
              <Field label={t.key} required hint={field ? t.keyLocked : t.keyHint}>
                <Input
                  value={draft.key}
                  disabled={!!field}
                  className="font-mono"
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  // kb-allow-raw: ví dụ mã trường (snake_case), không dịch
                  placeholder="lc_no"
                />
              </Field>
              <Field label={t.label} required>
                <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={t.labelPlaceholder} />
              </Field>
              <Field label={t.type}>
                <Select
                  options={typeOptions}
                  value={draft.type}
                  disabled={!!field}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as SkillField["type"] })}
                />
              </Field>
              <Field label={t.aliases} hint={t.aliasesHint} className="cq-md:col-span-2">
                {/* kb-allow-raw: ví dụ nhãn in trên chứng từ gốc (tiếng Anh), không dịch */}
                <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="L/C No., Letter of Credit No." />
              </Field>
              <Field
                label={t.note}
                hint={t.noteHint}
                className="cq-md:col-span-2"
              >
                <Input
                  value={draft.declarationField ?? ""}
                  onChange={(e) => setDraft({ ...draft, declarationField: e.target.value })}
                  placeholder={t.notePlaceholder}
                />
              </Field>
            </Grid>
            <Checkbox
              label={t.required}
              checked={draft.required}
              onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            />
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" loading={save.isPending}>{field ? t.save : t.add}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
