"use client";
// Màn Cách đọc chứng từ cho người dùng không cần biết "skill": tình trạng dễ đọc, gợi ý AI đề xuất (đồng ý/bỏ qua),
// trường hay sai kèm "Sửa nhãn", gợi ý đọc lại chứng từ đang mở sau khi cách đọc đổi, và công tắc "Nâng cao" cho cột kỹ thuật.
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Switch, Tooltip, fill, toast, useMessages } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lightbulb, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { getSession, sessionKeys } from "@/api/session";
import {
  acceptSuggestion, dismissSuggestion, getEvaluation, getStaleReads, listSuggestions, MIN_SAMPLES_FOR_ACCURACY, rereadStale, skillKeys, waitForEvaluation,
  type SkillSuggestion,
} from "@/api/skills";
import type { Skill, SkillField } from "@/mocks/types";
import { FieldDialog } from "./field-dialog";
import { formatPercent } from "./skill-display";
import { DISPLAY_MESSAGES, LEARNING_MESSAGES } from "./skills.messages";

// ---- Nâng cao (nhớ theo trình duyệt) ----

const ADVANCED_KEY = "kb-skills-advanced";
const readAdvanced = () => {
  try {
    return localStorage.getItem(ADVANCED_KEY) === "1";
  } catch {
    return false;
  }
};

export function useAdvanced(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(readAdvanced);
  return [
    on,
    (v) => {
      setOn(v);
      try {
        localStorage.setItem(ADVANCED_KEY, v ? "1" : "0");
      } catch {
        /* bỏ qua */
      }
    },
  ];
}

export function AdvancedSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const t = useMessages(LEARNING_MESSAGES);
  return (
    <Tooltip content={t.advancedHint}>
      <span>
        <Switch label={t.advanced} checked={value} onCheckedChange={onChange} />
      </span>
    </Tooltip>
  );
}

// ---- Vai trò ----

function useRole() {
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  return session.data?.user.role;
}
/** Áp gợi ý: người duyệt/quản trị (backend kiểm lại). */
export const useCanApply = () => ["OWNER", "ADMIN", "APPROVER"].includes(useRole() ?? "");
/** Sửa trường của skill: quản trị (backend kiểm lại). */
export const useCanEditFields = () => ["OWNER", "ADMIN"].includes(useRole() ?? "");

// ---- Tình trạng ----

export type SkillHealth = "good" | "ok" | "weak" | "needSamples";
export function skillHealth(s: Pick<Skill, "accuracy" | "labeledSamples">): SkillHealth {
  if (s.accuracy === undefined || s.labeledSamples < MIN_SAMPLES_FOR_ACCURACY) return "needSamples";
  return s.accuracy >= 0.95 ? "good" : s.accuracy >= 0.9 ? "ok" : "weak";
}

/** "Đọc tốt · 96%" / "Cần thêm mẫu". */
export function healthText(s: Pick<Skill, "accuracy" | "labeledSamples">, t: (typeof LEARNING_MESSAGES)["vi"]): string {
  const h = skillHealth(s);
  if (h === "needSamples") return t.statusNeedSamples;
  return `${h === "good" ? t.statusGood : h === "ok" ? t.statusOk : t.statusWeak} · ${formatPercent(s.accuracy!)}`;
}

/** Tình trạng bằng chữ (kèm % khi đã đo) – không truyền nghĩa chỉ bằng màu. */
export function SkillStatusBadge({ skill }: { skill: Pick<Skill, "accuracy" | "labeledSamples"> }) {
  const t = useMessages(LEARNING_MESSAGES);
  const td = useMessages(DISPLAY_MESSAGES);
  const h = skillHealth(skill);
  if (h === "needSamples") {
    return (
      <Tooltip content={fill(td.needSamples, { n: MIN_SAMPLES_FOR_ACCURACY })}>
        <span tabIndex={0} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <Badge tone="neutral" variant="outline">{t.statusNeedSamples}</Badge>
        </span>
      </Tooltip>
    );
  }
  return <Badge tone={h === "good" ? "success" : h === "ok" ? "warning" : "danger"}>{healthText(skill, t)}</Badge>;
}

// ---- Gợi ý AI đề xuất ----

/** Đồng ý gợi ý → báo kết quả; đủ mẫu thì chờ đánh giá lại để báo độ chính xác trước/sau. */
function useSuggestionActions(onAccepted?: (skillId: string) => void) {
  const t = useMessages(LEARNING_MESSAGES);
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: skillKeys.all });
  const accept = useMutation({
    mutationFn: async (s: SkillSuggestion) => ({ s, before: (await getEvaluation(s.skillId).catch(() => null)) ?? null, r: await acceptSuggestion(s.id) }),
    onSuccess: ({ s, before, r }) => {
      refresh();
      onAccepted?.(s.skillId);
      toast({ tone: "success", title: fill(t.accepted, { alias: s.alias, field: s.fieldLabel }), ...(r.evaluationQueued ? { description: t.evaluating } : {}) });
      if (!r.evaluationQueued) return;
      void waitForEvaluation(s.skillId, before?.finishedAt)
        .then((ev) => {
          if (!ev) return;
          refresh();
          const from = ev.previousAccuracy ?? before?.accuracy;
          toast({ tone: "info", title: from !== undefined ? fill(t.evalDone, { from: formatPercent(from), to: formatPercent(ev.accuracy) }) : fill(t.evalNow, { to: formatPercent(ev.accuracy) }) });
        })
        .catch(() => {});
    },
    onError: (e: Error) => toast({ tone: "danger", title: t.actionFailed, description: e.message }),
  });
  const dismiss = useMutation({
    mutationFn: (s: SkillSuggestion) => dismissSuggestion(s.id),
    onSuccess: refresh,
    onError: (e: Error) => toast({ tone: "danger", title: t.actionFailed, description: e.message }),
  });
  return { accept, dismiss };
}

/** Danh sách gợi ý đang chờ (của một cách đọc hoặc tất cả). Không có gợi ý → không hiện gì. */
export function SuggestionsPanel({ skillId, showSkill = false }: { skillId?: string; showSkill?: boolean }) {
  const t = useMessages(LEARNING_MESSAGES);
  const canApply = useCanApply();
  const [lastSkill, setLastSkill] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: skillKeys.suggestions(skillId), queryFn: () => listSuggestions(skillId) });
  const { accept, dismiss } = useSuggestionActions(setLastSkill);
  const list = data ?? [];
  if (!list.length && !lastSkill) return null;
  return (
    <Card>
      {list.length > 0 && (
        <>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb aria-hidden="true" className="h-4 w-4 text-warning-subtle-fg" />
              {t.suggestionsTitle}
              <Badge tone="warning">{list.length}</Badge>
            </CardTitle>
            <CardDescription>{canApply ? t.suggestionsDesc : `${t.suggestionsDesc} ${t.managerOnly}`}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-md border border-border">
              {list.map((s) => {
                const busy = (accept.isPending && accept.variables?.id === s.id) || (dismiss.isPending && dismiss.variables?.id === s.id);
                return (
                  <li key={s.id} className="flex flex-col gap-2 px-4 py-3 cq-sm:flex-row cq-sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">{fill(t.suggestionRow, { field: s.fieldLabel, alias: s.alias })}</p>
                      <p className="text-xs text-fg-subtle">
                        {[showSkill ? s.skillName : null, s.supplier ?? null, fill(t.seenTimes, { n: s.hits })].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {canApply && (
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" leftIcon={<Check className="h-4 w-4" />} loading={busy && accept.isPending} disabled={busy} onClick={() => accept.mutate(s)}>
                          {t.accept}
                        </Button>
                        <Button size="sm" variant="ghost" leftIcon={<X className="h-4 w-4" />} disabled={busy} onClick={() => dismiss.mutate(s)}>
                          {t.dismiss}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </>
      )}
      {lastSkill && (
        <CardContent className={list.length ? "pt-0" : "pt-6"}>
          <StaleReadsBanner skillId={lastSkill} />
        </CardContent>
      )}
    </Card>
  );
}

// ---- Đọc lại chứng từ đang mở ----

/** Chứng từ trong hồ sơ chưa xác nhận đọc bằng cách đọc cũ → một bấm để đọc lại. Không có → không hiện gì. */
export function StaleReadsBanner({ skillId }: { skillId: string }) {
  const t = useMessages(LEARNING_MESSAGES);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: skillKeys.stale(skillId), queryFn: () => getStaleReads(skillId) });
  const reread = useMutation({
    mutationFn: () => rereadStale(skillId),
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: skillKeys.stale(skillId) });
      toast({ tone: "success", title: fill(t.rereadDone, { n }) });
    },
    onError: (e: Error) => toast({ tone: "danger", title: t.rereadFailed, description: e.message }),
  });
  const n = data?.documents.length ?? 0;
  if (!n) return null;
  return (
    <Alert
      tone="info"
      title={fill(t.staleTitle, { n, m: data!.dossiers })}
      action={
        <Button size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} loading={reread.isPending} onClick={() => reread.mutate()}>
          {fill(t.reread, { n })}
        </Button>
      }
    >
      {t.staleBody}
    </Alert>
  );
}

// ---- Trường hay sai ----

/** Tối đa 3 trường kém nhất (< 90%) của lần đánh giá gần nhất, kèm "Sửa nhãn" mở hộp sửa trường. */
export function WeakFields({ skill }: { skill: Skill }) {
  const t = useMessages(LEARNING_MESSAGES);
  const canEdit = useCanEditFields();
  const [editing, setEditing] = useState<SkillField | undefined>();
  const { data } = useQuery({ queryKey: skillKeys.evaluation(skill.id), queryFn: () => getEvaluation(skill.id), enabled: skill.labeledSamples >= MIN_SAMPLES_FOR_ACCURACY });
  const weak = (data?.fields ?? []).filter((f) => f.accuracy < 0.9).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  if (!weak.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.weakTitle}</CardTitle>
        <CardDescription>{t.weakDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border rounded-md border border-border">
          {weak.map((w) => {
            const field = skill.fields.find((f) => f.key === w.key);
            return (
              <li key={w.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm font-medium text-fg">{w.label}</span>
                <Badge tone={w.accuracy < 0.8 ? "danger" : "warning"}>{formatPercent(w.accuracy)}</Badge>
                {canEdit && field && (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(field)}>
                    {t.fixLabels}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
      <FieldDialog skill={skill} field={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(undefined)} onSaved={(m) => toast({ tone: "success", title: m })} />
    </Card>
  );
}
