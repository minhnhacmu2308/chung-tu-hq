"use client";
// Mẫu chứng từ đã gắn nhãn: làm ví dụ cho AI và làm bộ đo khi "Đánh giá lại".
import {
  Alert, Badge, Button, Card, CardContent, EmptyState, FileDropzone, Skeleton, Stack, toast, SkeletonList, fill, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, RefreshCw, Tags } from "lucide-react";
import { useState } from "react";
import { confirmPendingSamples, listSamples, MIN_SAMPLES_FOR_ACCURACY, skillKeys, uploadSamples, type LabeledSample } from "@/api/skills";
import { formatBytesVi, formatRelative } from "@/lib/format";
import type { Skill } from "@/mocks/types";
import { SampleLabelDialog } from "./sample-label-dialog";
import { SAMPLES_MESSAGES } from "./skills.messages";

export function SkillSamples({ skill }: { skill: Skill }) {
  const t = useMessages(SAMPLES_MESSAGES);
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: skillKeys.samples(skill.id), queryFn: () => listSamples(skill.id) });
  const invalidate = () => qc.invalidateQueries({ queryKey: skillKeys.all });

  const [labeling, setLabeling] = useState<LabeledSample | null>(null);
  const upload = useMutation({
    mutationFn: (files: File[]) => uploadSamples(skill.id, files),
    onSuccess: (added) => {
      void invalidate();
      toast({ tone: "success", title: fill(t.uploaded, { n: added.length }), description: t.uploadedDesc });
    },
  });
  const confirm = useMutation({
    mutationFn: () => confirmPendingSamples(skill.id),
    onSuccess: (n) => {
      void invalidate();
      toast({ tone: "success", title: fill(t.confirmed, { n }), description: t.confirmedDesc });
    },
  });

  const pending = data?.filter((s) => s.status === "PENDING").length ?? 0;
  const hidden = Math.max(0, skill.labeledSamples - (data?.filter((s) => s.status === "LABELED").length ?? 0));

  return (
    <Stack gap="md">
      {skill.labeledSamples < MIN_SAMPLES_FOR_ACCURACY && (
        <Alert tone="warning" title={t.notEnoughTitle}>
          {fill(t.notEnoughBody, { min: MIN_SAMPLES_FOR_ACCURACY, n: skill.labeledSamples })}
        </Alert>
      )}
      <FileDropzone
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        maxSize={20 * 1024 * 1024}
        disabled={upload.isPending}
        onFiles={(files) => upload.mutate(files)}
        onReject={(r) => toast({ tone: "warning", title: fill(t.rejected, { n: r.length }), description: t.rejectedDesc })}
      />
      {pending > 0 && (
        <Alert
          tone="info"
          title={fill(t.pendingTitle, { n: pending })}
          action={<Button size="sm" leftIcon={<Tags className="h-4 w-4" />} loading={confirm.isPending} onClick={() => confirm.mutate()}>{t.labelAll}</Button>}
        >
          {t.pendingBody}
        </Alert>
      )}
      {isError ? (
        <Alert tone="danger" title={t.loadError} action={<Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>{t.retry}</Button>} />
      ) : isLoading || !data ? (
        <SkeletonList rows={3} />
      ) : data.length === 0 ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title={t.emptyTitle} description={t.emptyDesc} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {data.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <FileText className="h-5 w-5 shrink-0 text-fg-subtle" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{s.fileName}</p>
                    <p className="text-xs text-fg-subtle">
                      {fill(t.pages, { n: s.pages })} · {formatBytesVi(s.sizeBytes)} · {s.labeledBy} · {formatRelative(s.labeledAt)}
                    </p>
                  </div>
                  {s.status === "LABELED" ? <Badge tone="success">{t.labeled}</Badge> : <Badge tone="warning">{t.pending}</Badge>}
                  <Button size="sm" variant="ghost" leftIcon={<Pencil className="h-3.5 w-3.5" />} aria-label={`${s.status === "LABELED" ? t.editLabel : t.addLabel} ${s.fileName}`} onClick={() => setLabeling(s)}>
                    {s.status === "LABELED" ? t.editLabel : t.addLabel}
                  </Button>
                </li>
              ))}
            </ul>
            {hidden > 0 && <p className="border-t border-border px-4 py-3 text-sm text-fg-muted">{fill(t.older, { n: hidden })}</p>}
          </CardContent>
        </Card>
      )}
      {labeling && <SampleLabelDialog key={labeling.id} skill={skill} sample={labeling} onClose={() => setLabeling(null)} />}
    </Stack>
  );
}
