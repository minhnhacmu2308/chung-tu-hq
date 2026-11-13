"use client";
// Một khối trạng thái của thẻ Qua khu vực giám sát: "1 Khai danh sách container" / "2 Lấy DS qua KVGS" –
// trạng thái (StatusBadge), số Hải quan trả (tham chiếu, tiếp nhận), lý do khóa / ghi chú, các nút.
import { StatusBadge, useMessages } from "@kb/ui";
import type { ContainerListStatus } from "@kb/contracts";
import { useId, type ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { KVGS_MESSAGES } from "./kvgs.messages";

export const KVGS_STATUS = {
  DRAFT: "KVGS_DRAFT", SENDING: "KVGS_SENDING", ACCEPTED: "KVGS_ACCEPTED", REJECTED: "KVGS_REJECTED", NO_RESPONSE: "KVGS_NO_RESPONSE",
} as const satisfies Record<ContainerListStatus, string>;

export type KvgsStatusBlockProps = {
  index: 1 | 2;
  title: string;
  /** null = chưa gửi lần nào. */
  status: ContainerListStatus | null;
  refId: string | null;
  receiptNo: string | null;
  receiptDate: string | null;
  /** Lý do khóa (đã dịch) hoặc ghi chú trạng thái. */
  note?: ReactNode;
  actions: ReactNode;
};

export function KvgsStatusBlock({ index, title, status, refId, receiptNo, receiptDate, note, actions }: KvgsStatusBlockProps) {
  const t = useMessages(KVGS_MESSAGES);
  const headingId = useId();
  const facts = [
    refId ? { k: t.refId, v: refId } : null,
    receiptNo ? { k: t.receiptNo, v: receiptNo } : null,
    receiptDate ? { k: t.receiptDate, v: /^\d{4}-\d{2}-\d{2}$/.test(receiptDate) ? formatDate(receiptDate) : receiptDate } : null,
  ].filter((x): x is { k: string; v: string } => x !== null);
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-fg-muted">
          {index}
        </span>
        <h4 id={headingId} className="min-w-0 flex-1 text-sm font-semibold text-fg">
          {title}
        </h4>
        <StatusBadge status={KVGS_STATUS[status ?? "DRAFT"]} />
      </div>
      {facts.length > 0 && (
        <dl className="flex flex-col gap-1 text-sm">
          {facts.map((f) => (
            <div key={f.k} className="flex flex-wrap justify-between gap-x-3">
              <dt className="text-fg-muted">{f.k}</dt>
              <dd className="font-mono tabular-nums text-fg">{f.v}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && <div className="text-sm text-fg-muted">{note}</div>}
      <div className="mt-auto flex flex-wrap items-center gap-2">{actions}</div>
    </section>
  );
}
