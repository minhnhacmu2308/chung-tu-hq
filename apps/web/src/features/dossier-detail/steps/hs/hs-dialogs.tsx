"use client";
// Hộp "Trả lời AI" (câu hỏi của HSCodePro, tài liệu §6) và "Phân loại lại" một dòng hàng.
import { Button, Checkbox, Dialog, DialogContent, DialogFooter, Field, Input, RadioGroup, Stack, Textarea, toast, fill, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { answerHs, declarationKeys, reclassifyHs } from "@/api/declaration";
import { ApiError } from "@/lib/api-error";
import type { LineItem } from "@/mocks/types";
import { errorMessage } from "../declaration-parts";
import { answersFor, buildAnswers, emptyAnswerState, isAnswerComplete, sameQuestionItems, type AnswerState } from "./hs-answer";
import { HS_MESSAGES } from "./hs.messages";

const useInvalidateItems = (dossierId: string) => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: declarationKeys.items(dossierId) });
    void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
  };
};

/** `items` = mọi dòng của hồ sơ: dòng hàng giống nhau đang chờ cùng câu hỏi được trả lời luôn một lần. */
export function HsAnswerDialog({ item, items = [], onClose, dossierId }: { item: LineItem | null; items?: readonly LineItem[]; onClose: () => void; dossierId: string }) {
  const t = useMessages(HS_MESSAGES);
  const q = item?.hs?.question ?? null;
  return (
    <Dialog open={item !== null && q !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={fill(t.answerTitle, { line: item?.lineNo ?? "" })} icon={<MessageCircleQuestion className="h-4 w-4" />} description={item?.description} size="md">
        {item && q && <AnswerForm key={q.id} item={item} same={sameQuestionItems(item, items)} onDone={onClose} dossierId={dossierId} />}
      </DialogContent>
    </Dialog>
  );
}

function AnswerForm({ item, same, onDone, dossierId }: { item: LineItem; same: LineItem[]; onDone: () => void; dossierId: string }) {
  const t = useMessages(HS_MESSAGES);
  const q = item.hs!.question!;
  const [state, setState] = useState<AnswerState>(() => emptyAnswerState(q));
  // Hàng giống nhau (khác số lượng/trị giá) thường cùng câu hỏi → mặc định trả lời luôn cho các dòng đó.
  const [applySame, setApplySame] = useState(true);
  const invalidate = useInvalidateItems(dossierId);
  const send = useMutation({
    mutationFn: async () => {
      await answerHs(item.id, buildAnswers(q, state));
      const others = applySame ? same : [];
      let ok = 1;
      // Theo lô nhỏ như xác nhận nhiều dòng – không dồn hàng chục request một lúc; dòng lỗi để người dùng trả lời lại.
      for (let i = 0; i < others.length; i += 6) {
        const res = await Promise.allSettled(others.slice(i, i + 6).map((o) => answerHs(o.id, answersFor(o.hs!.question!, q, state))));
        ok += res.filter((r) => r.status === "fulfilled").length;
      }
      return { ok, n: others.length + 1 };
    },
    onSuccess: ({ ok, n }) => {
      if (ok < n) toast({ tone: "warning", title: fill(t.answerSentPartial, { ok, n, fail: n - ok }) });
      else toast({ tone: "success", title: n > 1 ? fill(t.answerSentMany, { n }) : fill(t.answerSent, { line: item.lineNo }), description: t.answerSentDesc });
      invalidate();
      onDone();
    },
    onError: (e) => {
      // 409: đã trả lời ở chỗ khác / bấm hai lần → tải lại theo trạng thái mới, không báo lỗi đỏ.
      if (e instanceof ApiError && e.code === "INVALID_STATE") {
        invalidate();
        onDone();
        return;
      }
      toast({ tone: "danger", title: errorMessage(e) });
    },
  });
  const set = (id: string, patch: Partial<AnswerState[string]>) => setState((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isAnswerComplete(q, state)) send.mutate();
  };
  return (
    <form onSubmit={submit}>
      <Stack gap="lg">
        {item.hs?.error && <p className="text-sm text-danger-subtle-fg">{item.hs.error.message}</p>}
        {q.questions.map((x) => {
          const s = state[x.id]!;
          const title = x.header ? `${x.header}: ${x.question}` : x.question;
          return (
            <Stack key={x.id} gap="sm">
              {x.options?.length ? (
                x.multiSelect ? (
                  <fieldset className="min-w-0">
                    <legend className="text-sm font-medium text-fg">{title}</legend>
                    {x.detail && <p className="mt-0.5 text-xs text-fg-muted">{x.detail}</p>}
                    <Stack gap="xs" className="mt-2">
                      {x.options.map((o) => (
                        <Checkbox
                          key={o.label}
                          label={o.description ? `${o.label} – ${o.description}` : o.label}
                          checked={s.selected.includes(o.label)}
                          onChange={(ev) => set(x.id, { selected: ev.target.checked ? [...s.selected, o.label] : s.selected.filter((l) => l !== o.label) })}
                        />
                      ))}
                    </Stack>
                  </fieldset>
                ) : (
                  <RadioGroup
                    label={title}
                    {...(x.detail ? { description: x.detail } : {})}
                    options={x.options.map((o) => ({ value: o.label, label: o.label, ...(o.description ? { description: o.description } : {}) }))}
                    value={s.selected[0] ?? null}
                    onChange={(v) => set(x.id, { selected: [v] })}
                  />
                )
              ) : (
                <p className="text-sm font-medium text-fg">{title}</p>
              )}
              <Field label={x.options?.length ? t.otherAnswer : t.answer} {...(!x.options?.length && x.detail ? { hint: x.detail } : {})}>
                <Textarea rows={2} value={s.custom} onChange={(ev) => set(x.id, { custom: ev.target.value })} placeholder={t.answerPlaceholder} />
              </Field>
            </Stack>
          );
        })}
        {same.length > 0 && (
          <Checkbox
            className="rounded-md border border-border bg-surface-muted p-3"
            label={fill(t.applySame, { n: same.length, lines: same.map((o) => o.lineNo).join(", ") })}
            checked={applySame}
            onChange={(ev) => setApplySame(ev.target.checked)}
          />
        )}
      </Stack>
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={onDone}>
          {t.later}
        </Button>
        <Button type="submit" disabled={!isAnswerComplete(q, state)} loading={send.isPending}>
          {t.sendAnswer}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReclassifyDialog({ item, onClose, dossierId }: { item: LineItem | null; onClose: () => void; dossierId: string }) {
  const t = useMessages(HS_MESSAGES);
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={fill(t.reclassifyTitle, { line: item?.lineNo ?? "" })} icon={<RotateCcw className="h-4 w-4" />} description={item?.description} size="md">
        {item && <ReclassifyForm key={item.id} item={item} onDone={onClose} dossierId={dossierId} />}
      </DialogContent>
    </Dialog>
  );
}

function ReclassifyForm({ item, onDone, dossierId }: { item: LineItem; onDone: () => void; dossierId: string }) {
  const t = useMessages(HS_MESSAGES);
  const needsOrigin = item.hs?.error?.code === "NO_ORIGIN" || !/^[A-Z]{2}$/.test(item.origin);
  const [extra, setExtra] = useState("");
  const [origin, setOrigin] = useState(/^[A-Z]{2}$/.test(item.origin) ? item.origin : "");
  const originOk = /^[A-Z]{2}$/.test(origin);
  const invalidate = useInvalidateItems(dossierId);
  const run = useMutation({
    mutationFn: () => reclassifyHs(item.id, { ...(extra.trim() ? { extraDescription: extra.trim() } : {}), ...(originOk && origin !== item.origin ? { origin } : {}) }),
    onSuccess: () => {
      toast({ tone: "success", title: fill(t.reclassifying, { line: item.lineNo }) });
      invalidate();
      onDone();
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!needsOrigin || originOk) run.mutate();
      }}
    >
      <Stack gap="md">
        {item.hs?.error && <p className="text-sm text-fg-muted">{fill(t.lastError, { msg: item.hs.error.message })}</p>}
        <Field label={t.originLabel} hint={t.originHint} {...(needsOrigin && !originOk && origin ? { error: t.originError } : {})}>
          <Input className="cq-sm:max-w-32" value={origin} maxLength={2} onChange={(e) => setOrigin(e.target.value.toUpperCase())} required={needsOrigin} />
        </Field>
        <Field label={t.extraLabel} hint={t.extraHint}>
          <Textarea rows={3} value={extra} maxLength={500} onChange={(e) => setExtra(e.target.value)} />
        </Field>
      </Stack>
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={onDone}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={needsOrigin && !originOk} loading={run.isPending}>
          {t.reclassify}
        </Button>
      </DialogFooter>
    </form>
  );
}
