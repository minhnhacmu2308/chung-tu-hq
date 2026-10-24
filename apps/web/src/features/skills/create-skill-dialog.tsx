"use client";
// Tạo skill mới cho doanh nghiệp: trường chuẩn của loại chứng từ hoặc sao chép từ skill có sẵn cùng loại.
import { nextSkillCode, SKILL_CODE_PATTERN, type CreateSkillInput } from "@kb/contracts";
import { Alert, Button, Dialog, DialogContent, DialogFooter, Field, Grid, Input, Select, Stack, fill, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createSkill, skillKeys } from "@/api/skills";
import { errorText } from "@/lib/reason-codes";
import { DOC_KIND_LABELS, type DocKind, type Skill, type SkillKind } from "@/mocks/types";
import { CREATE_SKILL_MESSAGES, SKILL_KIND_LABELS } from "./skills.messages";

type Draft = { name: string; kind: SkillKind; docKind: DocKind; supplier: string; code: string; language: string; copyFrom: string };
type Errors = Partial<Record<"name" | "supplier" | "code", string>>;

const KINDS: SkillKind[] = ["DOCUMENT", "SUPPLIER"];

const emptyDraft = (kind: SkillKind): Draft => ({ name: "", kind, docKind: "INVOICE", supplier: "", code: "", language: "", copyFrom: "" });

/** Kiểm tra phía giao diện (cùng luật CreateSkillInputSchema) để báo lỗi đúng ngôn ngữ trước khi gửi. */
function validate(d: Draft, t: (typeof CREATE_SKILL_MESSAGES)["vi"]): Errors {
  const e: Errors = {};
  const name = d.name.trim();
  if (name.length < 2 || name.length > 120) e.name = t.errName;
  const supplier = d.supplier.trim();
  if (d.kind === "SUPPLIER" && (supplier.length < 2 || supplier.length > 120)) e.supplier = t.errSupplier;
  const code = d.code.trim().toUpperCase();
  if (code && (code.length > 44 || !SKILL_CODE_PATTERN.test(code))) e.code = t.errCode;
  return e;
}

function toInput(d: Draft): CreateSkillInput {
  const code = d.code.trim().toUpperCase();
  const language = d.language.trim();
  return {
    name: d.name.trim(),
    kind: d.kind,
    docKind: d.docKind,
    ...(d.kind === "SUPPLIER" ? { supplier: d.supplier.trim() } : {}),
    ...(code ? { code } : {}),
    ...(language ? { language } : {}),
    ...(d.copyFrom ? { copyFromSkillId: d.copyFrom } : {}),
  };
}

type FormProps = {
  /** Danh sách skill đã tải ở trang – nguồn sao chép + tính mã tự sinh. */
  skills: Skill[];
  defaultKind: SkillKind;
  onCancel: () => void;
  onCreated: (skill: Skill) => void;
};

/** Thân popup (tách riêng để test render 3 ngôn ngữ không cần mở Dialog). */
export function CreateSkillForm({ skills, defaultKind, onCancel, onCreated }: FormProps) {
  const t = useMessages(CREATE_SKILL_MESSAGES);
  const kindLabels = useMessages(SKILL_KIND_LABELS);
  const docKindLabels = useMessages(DOC_KIND_LABELS);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultKind));
  const [errors, setErrors] = useState<Errors>({});

  const docKindOptions = (Object.keys(docKindLabels) as DocKind[]).map((k) => ({ value: k, label: docKindLabels[k] }));
  const kindOptions = KINDS.map((k) => ({ value: k, label: kindLabels[k] }));
  const sources = useMemo(() => skills.filter((s) => s.docKind === draft.docKind), [skills, draft.docKind]);
  const startOptions = [{ value: "", label: t.startCatalog }, ...sources.map((s) => ({ value: s.id, label: fill(t.startCopy, { code: s.code, name: s.name }) }))];
  const autoCode = useMemo(() => nextSkillCode(draft.docKind, skills.map((s) => s.code)), [draft.docKind, skills]);

  const save = useMutation({
    mutationFn: (input: CreateSkillInput) => createSkill(input),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      toast({ tone: "success", title: fill(t.created, { code: s.code }) });
      onCreated(s);
    },
  });

  const errorMessage = (e: unknown) =>
    (e as { code?: unknown }).code === "DUPLICATE" ? fill(t.errDuplicate, { code: draft.code.trim().toUpperCase() || autoCode }) : errorText(e, locale, t.errUnknown);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const next = validate(draft, t);
        setErrors(next);
        if (Object.keys(next).length === 0) save.mutate(toInput(draft));
      }}
    >
      <Stack gap="md">
        {save.isError && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <Grid cols={{ base: 1, md: 2 }}>
          <Field label={t.name} required {...(errors.name ? { error: errors.name } : {})} className="cq-md:col-span-2">
            <Input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t.namePlaceholder} />
          </Field>
          <Field label={t.kind}>
            <Select options={kindOptions} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as SkillKind })} />
          </Field>
          <Field label={t.docKind} required>
            <Select
              options={docKindOptions}
              value={draft.docKind}
              // Đổi loại chứng từ → bỏ skill nguồn (chỉ sao chép giữa skill cùng loại).
              onChange={(e) => setDraft({ ...draft, docKind: e.target.value as DocKind, copyFrom: "" })}
            />
          </Field>
          {draft.kind === "SUPPLIER" && (
            <Field label={t.supplier} required {...(errors.supplier ? { error: errors.supplier } : {})} hint={t.supplierHint} className="cq-md:col-span-2">
              {/* kb-allow-raw: ví dụ tên nhà cung cấp in trên chứng từ gốc, không dịch */}
              <Input value={draft.supplier} maxLength={120} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} placeholder="HANSOL PRECISION CO., LTD." />
            </Field>
          )}
          <Field label={t.code} {...(errors.code ? { error: errors.code } : {})} hint={t.codeHint}>
            <Input
              value={draft.code}
              className="font-mono"
              maxLength={44}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              placeholder={fill(t.codePlaceholder, { code: autoCode })}
            />
          </Field>
          <Field label={t.language}>
            <Input value={draft.language} maxLength={60} onChange={(e) => setDraft({ ...draft, language: e.target.value })} placeholder={t.languagePlaceholder} />
          </Field>
          <Field label={t.startFrom} hint={t.startHint} className="cq-md:col-span-2">
            <Select options={startOptions} value={draft.copyFrom} onChange={(e) => setDraft({ ...draft, copyFrom: e.target.value })} />
          </Field>
        </Grid>
      </Stack>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button>
        <Button type="submit" loading={save.isPending}>{t.submit}</Button>
      </DialogFooter>
    </form>
  );
}

type DialogProps = { skills: Skill[]; defaultKind: SkillKind; open: boolean; onOpenChange: (open: boolean) => void };

export function CreateSkillDialog({ skills, defaultKind, open, onOpenChange }: DialogProps) {
  const t = useMessages(CREATE_SKILL_MESSAGES);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.title} icon={<Sparkles className="h-4 w-4" />} description={t.description}>
        {/* Đóng popup thì nội dung bị gỡ → mở lại là form mới, loại theo tab đang xem. */}
        <CreateSkillForm
          skills={skills}
          defaultKind={defaultKind}
          onCancel={() => onOpenChange(false)}
          onCreated={(s) => {
            onOpenChange(false);
            router.push(`/skills/${s.id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
