"use client";
// Ô "Gợi ý hscodepro" theo trạng thái phân loại của dòng hàng (tài liệu HSCodePro §2, §5).
import { Badge, Button, Progress, Spinner, fill, useMessages } from "@kb/ui";
import { AlertTriangle, History, MessageCircleQuestion, RotateCcw } from "lucide-react";
import type { LineItem } from "@/mocks/types";
import type { CatalogMatch } from "./catalog-match";
import { hsTone } from "./hs-format";
import { HS_MESSAGES } from "./hs.messages";

export function ConfidenceMeter({ value, warn = false }: { value: number; warn?: boolean }) {
  const t = useMessages(HS_MESSAGES);
  const pct = Math.round(value * 100);
  const tone = warn ? "warning" : pct >= 85 ? "success" : pct >= 70 ? "primary" : "warning";
  return (
    <div className="flex w-28 items-center gap-2">
      <Progress value={pct} size="sm" tone={tone} aria-label={fill(t.confidenceAria, { pct })} className="flex-1" />
      <span className="w-9 text-right text-xs tabular-nums text-fg-muted">{pct}%</span>
    </div>
  );
}

/** Mặt hàng cùng tên đã khai trong danh mục hàng hóa → mã đã dùng + nút dùng luôn (chỉ khi dòng chưa xác nhận). */
export function DeclaredBeforeHint({ item, match, onUse, busy = false }: { item: LineItem; match: CatalogMatch; onUse: (it: LineItem, code: string) => void; busy?: boolean }) {
  const t = useMessages(HS_MESSAGES);
  return (
    <div className="mt-1 flex flex-col items-start gap-1 border-t border-border pt-1.5" title={fill(t.declaredBeforeTitle, { name: match.product.name })}>
      <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
        <History aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {fill(t.declaredBefore, { code: match.code, n: match.product.timesDeclared })}
      </span>
      {!item.hsConfirmed && (
        <Button size="sm" variant="secondary" loading={busy} onClick={() => onUse(item, match.code)} aria-label={fill(t.useDeclaredAria, { code: match.code, line: item.lineNo })}>
          {t.useDeclared}
        </Button>
      )}
    </div>
  );
}

export function HsSuggestionCell({ item, onAnswer, onReclassify }: { item: LineItem; onAnswer: (it: LineItem) => void; onReclassify: (it: LineItem) => void }) {
  const t = useMessages(HS_MESSAGES);
  const hs = item.hs;
  const status = hs?.status ?? (item.hsSuggested ? "completed" : "idle");

  if (status === "queued" || status === "processing" || status === "answering") {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-fg-muted">
        <Spinner size="sm" />
        {status === "queued" ? t.busyQueued : status === "processing" ? t.busyProcessing : t.busyAnswering}
      </span>
    );
  }
  if (status === "need_info") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Badge tone="warning" icon={<MessageCircleQuestion className="h-3.5 w-3.5" />}>{t.needInfo}</Badge>
        <Button size="sm" variant="secondary" onClick={() => onAnswer(item)} aria-label={fill(t.answerAiAria, { line: item.lineNo })}>
          {t.answerAi}
        </Button>
      </div>
    );
  }
  if (status === "failed" || status === "cancelled" || status === "skipped") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <p className="text-xs text-fg-muted">{status === "cancelled" ? t.cancelled : hs?.error?.message ?? t.noSuggestion}</p>
        {!item.hsConfirmed && (
          <Button size="sm" variant="ghost" leftIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => onReclassify(item)} aria-label={fill(t.reclassifyAria, { line: item.lineNo })}>
            {t.reclassify}
          </Button>
        )}
      </div>
    );
  }
  if (!item.hsSuggested) return <span className="text-xs text-fg-subtle">{t.notLookedUp}</span>;
  const warnings = hs?.warnings ?? [];
  const warn = item.hsConfidence !== undefined && hsTone(item.hsConfidence, warnings) === "warning";
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-sm text-fg">{item.hsSuggested}</span>
      {item.hsConfidence !== undefined && <ConfidenceMeter value={item.hsConfidence} warn={warn} />}
      {hs?.descriptionVi && <p className="line-clamp-2 text-xs text-fg-muted" title={hs.descriptionVi}>{fill(t.descriptionVi, { desc: hs.descriptionVi })}</p>}
      {warnings.map((w) => (
        // Cảnh báo quản lý chuyên ngành dài → tối đa 2 dòng, rê chuột xem đủ (dòng hàng không cao vống).
        <p key={w} className="flex items-start gap-1 text-xs text-warning-subtle-fg" title={w}>
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{w}</span>
        </p>
      ))}
    </div>
  );
}
