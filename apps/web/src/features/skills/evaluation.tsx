"use client";
// "Đánh giá lại": chạy skill trên toàn bộ mẫu đã gắn nhãn, so với nhãn → độ chính xác chung + từng trường.
import { Alert, Badge, Button, Dialog, DialogContent, DialogFooter, Progress, Stack, toast, fill, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { evaluateSkill, MIN_SAMPLES_FOR_ACCURACY, skillKeys, type EvaluationResult } from "@/api/skills";
import type { Skill } from "@/mocks/types";
import { accuracyTone, formatPercent } from "./skill-display";
import { EVALUATION_MESSAGES } from "./skills.messages";

const DURATION = 4200;

/** Bảng độ chính xác từng trường, sắp trường kém nhất lên đầu. */
export function FieldAccuracyList({ fields }: { fields: EvaluationResult["fields"] }) {
  const t = useMessages(EVALUATION_MESSAGES);
  const sorted = [...fields].sort((a, b) => a.accuracy - b.accuracy);
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {sorted.map((f) => (
        <li key={f.key} className="grid grid-cols-1 gap-2 px-4 py-3 cq-sm:grid-cols-12 cq-sm:items-center">
          <div className="cq-sm:col-span-4">
            <p className="text-sm font-medium text-fg">{f.label}</p>
            <p className="font-mono text-xs text-fg-subtle">{f.key}</p>
          </div>
          <Progress className="cq-sm:col-span-5" value={Math.round(f.accuracy * 100)} tone={accuracyTone(f.accuracy)} aria-label={fill(t.accuracyAria, { label: f.label })} />
          <div className="flex items-center gap-2 cq-sm:col-span-3 cq-sm:justify-end">
            <Badge tone={accuracyTone(f.accuracy)}>{formatPercent(f.accuracy)}</Badge>
            <span className="text-xs text-fg-subtle">{fill(t.errors, { n: f.errors })}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EvaluateButton({ skill, onDone }: { skill: Skill; onDone?: (r: EvaluationResult) => void }) {
  const t = useMessages(EVALUATION_MESSAGES);
  const PHASES = [t.phase1, t.phase2, t.phase3, t.phase4];
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const enough = skill.labeledSamples >= MIN_SAMPLES_FOR_ACCURACY;

  const run = useMutation({
    mutationFn: () => evaluateSkill(skill.id),
    onSuccess: (r) => {
      setResult(r);
      onDone?.(r);
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      toast({ tone: "success", title: fill(t.doneTitle, { code: skill.code, version: r.version }), description: fill(t.doneDesc, { value: formatPercent(r.accuracy) }) });
    },
  });

  const start = () => {
    setOpen(true);
    setResult(null);
    setProgress(0);
    run.reset();
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const p = Math.min(100, Math.round(((Date.now() - t0) / DURATION) * 100));
      setProgress(p);
      if (p >= 100) {
        if (timer.current) clearInterval(timer.current);
        run.mutate();
      }
    }, 120);
  };

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const close = (o: boolean) => {
    if (!o && timer.current) clearInterval(timer.current);
    setOpen(o);
  };

  const phase = PHASES[Math.min(PHASES.length - 1, Math.floor((progress / 100) * PHASES.length))]!;
  const delta = result?.previousAccuracy !== undefined ? result.accuracy - result.previousAccuracy : undefined;

  return (
    <>
      <Button
        variant="secondary"
        leftIcon={<FlaskConical className="h-4 w-4" />}
        onClick={start}
        disabled={!enough}
        title={enough ? undefined : fill(t.needSamples, { n: MIN_SAMPLES_FOR_ACCURACY })}
      >
        {t.reevaluate}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          title={fill(t.dialogTitle, { code: skill.code })}
          icon={<FlaskConical className="h-4 w-4" />}
          description={fill(t.dialogDesc, { n: skill.labeledSamples })}
          size="md"
        >
          {run.isError ? (
            <Alert tone="danger" title={t.failed}>{run.error.message}</Alert>
          ) : !result ? (
            <Stack gap="sm">
              <Progress value={progress} label={phase} showValue />
              <p className="text-xs text-fg-subtle">{t.background}</p>
            </Stack>
          ) : (
            <Stack gap="md">
              <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-muted p-4">
                {result.previousAccuracy !== undefined && (
                  <>
                    <span className="text-2xl font-semibold text-fg-muted">{formatPercent(result.previousAccuracy)}</span>
                    <ArrowRight className="h-5 w-5 text-fg-subtle" aria-label={t.arrow} />
                  </>
                )}
                <span className="text-2xl font-semibold text-fg">{formatPercent(result.accuracy)}</span>
                {delta !== undefined && (
                  <Badge tone={delta >= 0 ? "success" : "danger"}>
                    {delta >= 0 ? "+" : "−"}
                    {formatPercent(Math.abs(delta))}
                  </Badge>
                )}
                <span className="text-sm text-fg-muted">{fill(t.versionSamples, { version: result.version, n: result.samples })}</span>
              </div>
              <FieldAccuracyList fields={result.fields} />
            </Stack>
          )}
          <DialogFooter>
            <Button variant={result ? "primary" : "ghost"} onClick={() => close(false)}>{result ? t.done : t.cancel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
