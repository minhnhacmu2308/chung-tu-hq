"use client";
// Khung "Còn N chỉ tiêu bắt buộc chưa nhập" – bước Review (nút Phê duyệt khóa) và bước Khai báo (nút Ký số khóa). Liệt kê tối đa 6 ô, còn lại ghi "và N ô khác".
import { Alert, Button, fill, useMessages } from "@kb/ui";
import type { RequiredGap } from "@kb/contracts";
import type { ReactNode } from "react";
import { PRINT_MESSAGES } from "./print.messages";

const SHOWN = 6;

export function RequiredGapsAlert({ gaps, lineNos, children, actionLabel, onAction }: {
  gaps: RequiredGap[]; lineNos: number[]; children: ReactNode; actionLabel: string; onAction: () => void;
}) {
  const t = useMessages(PRINT_MESSAGES);
  if (!gaps.length) return null;
  const rest = gaps.length - SHOWN;
  return (
    <Alert
      tone="danger"
      title={fill(t.gapsTitle, { n: gaps.length })}
      action={
        <Button size="sm" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      }
    >
      <p>{children}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {gaps.slice(0, SHOWN).map((g) => (
          <li key={`${g.line ?? ""}:${g.key}`}>
            {g.line !== undefined && <span className="font-medium">{fill(t.lineN, { n: lineNos[g.line] ?? g.line + 1 })}: </span>}
            {g.no && <span className="tabular-nums">{g.no} </span>}
            {g.label}
          </li>
        ))}
        {rest > 0 && <li className="text-fg-muted">{fill(t.moreN, { n: rest })}</li>}
      </ul>
    </Alert>
  );
}
