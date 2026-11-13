"use client";
// Danh sách thông điệp gửi/nhận Hải quan: thẻ nhật ký của hồ sơ, khối nhật ký trong thẻ từng tờ, lịch sử của thẻ Qua khu vực giám sát.
import { Badge, EmptyState, useMessages } from "@kb/ui";
import type { SubmissionView } from "@/api/customs";
import { ArrowDownLeft, ArrowUpRight, StickyNote } from "lucide-react";
import { formatDateTime, formatTime } from "@/lib/format";
import { SUBMIT_MESSAGES } from "./submit-step.messages";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function MessageList({ messages }: { messages: SubmissionView["messages"] }) {
  const t = useMessages(SUBMIT_MESSAGES);
  if (messages.length === 0) return <EmptyState title={t.logEmptyTitle} description={t.logEmptyDesc} />;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border" aria-live="polite">
      {messages.map((m) => (
        <li key={m.id}>
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              {m.direction === "NOTE" ? (
                <StickyNote aria-label={t.note} className="h-4 w-4 text-fg-subtle" />
              ) : m.direction === "OUT" ? (
                <ArrowUpRight aria-label={t.outgoing} className="h-4 w-4 text-fg-subtle" />
              ) : (
                <ArrowDownLeft aria-label={t.incoming} className="h-4 w-4 text-primary" />
              )}
              <Badge tone="neutral" variant="outline" className="font-mono">
                {m.operation}
              </Badge>
              <span className="min-w-0 flex-1 text-sm text-fg cq-sm:min-w-48">{m.summary}</span>
              {m.direction === "NOTE" ? (
                <Badge tone="neutral">{t.note}</Badge>
              ) : (
                <Badge tone={m.result === "OK" ? "success" : m.result === "ERROR" ? "danger" : "info"}>
                  {m.result === "OK" ? t.pipeOk : m.result === "ERROR" ? t.pipeError : t.pipeSending}
                </Badge>
              )}
              <span className="text-xs tabular-nums text-fg-subtle" title={formatDateTime(m.at)}>{isToday(m.at) ? formatTime(m.at) : formatDateTime(m.at)}</span>
            </summary>
            <pre className="mx-3 mb-3 overflow-x-auto rounded-md bg-surface-muted p-3 font-mono text-xs text-fg-muted">{m.payloadPreview}</pre>
          </details>
        </li>
      ))}
    </ul>
  );
}
