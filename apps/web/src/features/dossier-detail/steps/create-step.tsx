"use client";
// Bước 1 – xem lại thông tin đã khai khi tạo hồ sơ; ghi chú nội bộ sửa được.
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, Grid, Textarea, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { dossierKeys, updateDossier } from "@/api/dossiers";
import { transportLabels } from "@/features/dossiers/dossier-display";
import { typeGroupOf, typeGroupOptions } from "@/features/dossiers/create-dossier-options";
import { formatDate, formatDateTime } from "@/lib/format";
import type { StepProps } from "./types";
import { CREATE_STEP_MESSAGES } from "./create-step.messages";
import { toastMutationError } from "@/lib/mutation-error";

export function CreateSummaryStep({ dossier, goTo }: StepProps) {
  const t = useMessages(CREATE_STEP_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const [note, setNote] = useState(dossier.note ?? "");
  const save = useMutation({
    mutationFn: () => updateDossier(dossier.id, { note: note.trim() }),
    onSuccess: (d) => {
      qc.setQueryData(dossierKeys.detail(d.id), d);
      toast({ tone: "success", title: t.noteSaved });
    },
    onError: toastMutationError(t.noteSaveFailed),
  });

  const rows: [string, string][] = [
    [t.dossierType, dossier.direction === "NK" ? t.import : t.export],
    [t.typeGroup, typeGroupOptions(locale).find((g) => g.value === typeGroupOf(dossier.typeCode))?.label ?? ""],
    [t.typeCode, dossier.typeCode],
    [t.partner, dossier.partner],
    [t.customsOffice, dossier.customsOffice],
    ...(dossier.incoterm ? [[t.incoterm, dossier.incoterm] as [string, string]] : []),
    [t.transportMode, transportLabels(locale)[dossier.transportMode]],
    [t.billNo, dossier.billNo || t.billNoMissing],
    [t.skillSet, dossier.skillSetId === "default" ? t.skillSetDefault : dossier.skillSetId],
    [t.dueDate, formatDate(dossier.dueDate)],
    [t.createdAt, formatDateTime(dossier.createdAt)],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Grid cols={{ base: 1, md: 2 }}>
          <dl className="grid gap-x-6 gap-y-3 cq-sm:grid-cols-2 cq-md:col-span-2 cq-xl:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-fg-subtle">{k}</dt>
                <dd className="break-words text-sm text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <Field label={t.noteLabel} hint={t.noteHint} className="cq-md:col-span-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t.notePlaceholder} />
          </Field>
        </Grid>
      </CardContent>
      <CardFooter>
        <Button variant="secondary" loading={save.isPending} disabled={note.trim() === (dossier.note ?? "")} onClick={() => save.mutate()}>
          {t.saveNote}
        </Button>
        <Button rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => goTo("upload")}>
          {t.toUpload}
        </Button>
      </CardFooter>
    </Card>
  );
}
