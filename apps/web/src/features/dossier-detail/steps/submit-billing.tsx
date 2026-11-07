"use client";
// Lượt khai / hợp đồng ở bước Truyền tờ khai (ADR 0011 §6.2): dòng "lô này dùng N lượt", chặn khi thiếu lượt / hợp đồng hết hạn,
// hiện cùng một Alert khi máy chủ báo INSUFFICIENT_CREDITS / CONTRACT_EXPIRED. Quy tắc chặn dùng chung @kb/contracts (allowanceDecision) như backend.
import { allowanceDecision, type Organization } from "@kb/contracts";
import { Alert, Button, fill, useMessages } from "@kb/ui";
import Link from "next/link";
import { ApiError } from "@/lib/api-error";
import { formatDate, formatNumber } from "@/lib/format";
import { SUBMIT_BILLING_MESSAGES } from "./submit-billing.messages";
import { byCount } from "@/lib/plural";

/** Lý do chặn gửi do gói. `endsOn`: YYYY-MM-DD (từ gói) hoặc chuỗi đã định dạng (tham số lỗi của máy chủ). */
export type BillingBlock = { code: "INSUFFICIENT_CREDITS"; needed: number; available: number } | { code: "CONTRACT_EXPIRED"; endsOn: string | null };

/** Lỗi máy chủ do gói (402 INSUFFICIENT_CREDITS / CONTRACT_EXPIRED) → BillingBlock; lỗi khác → null. */
export function billingErrorOf(e: unknown): BillingBlock | null {
  if (!(e instanceof ApiError)) return null;
  const code = e.reason ?? e.code;
  if (code === "INSUFFICIENT_CREDITS") return { code, needed: Number(e.params?.needed ?? 0), available: Number(e.params?.available ?? 0) };
  if (code === "CONTRACT_EXPIRED") return { code, endsOn: typeof e.params?.endsOn === "string" ? e.params.endsOn : null };
  return null;
}

/**
 * Gửi `sheetsToStart` tờ khai tạm lần đầu có bị gói chặn không. `ownReserved`: số tờ trong đó đã giữ lượt (khai chính thức cả lô).
 * Chưa tải được gói → không chặn ở giao diện (máy chủ vẫn chặn).
 */
export function billingBlockFor(org: Organization | undefined, sheetsToStart: number, ownReserved = 0): BillingBlock | null {
  if (!org) return null;
  const d = allowanceDecision({
    kind: org.plan.kind, balance: org.billing.balance, reserved: org.billing.reserved, sheetsToStart, ownReserved, contract: org.billing.contract?.status ?? null,
  });
  if (d.ok) return null;
  return d.code === "INSUFFICIENT_CREDITS" ? { code: d.code, needed: d.needed, available: d.available } : { code: d.code, endsOn: org.billing.contract?.endsOn ?? null };
}

const showDate = (v: string | null) => (!v ? "—" : /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v);

/** Alert chặn gửi (thiếu lượt → nút Mua lượt; hợp đồng hết hạn → Xem gói). */
export function BillingBlockAlert({ block }: { block: BillingBlock }) {
  const t = useMessages(SUBMIT_BILLING_MESSAGES);
  if (block.code === "INSUFFICIENT_CREDITS") {
    return (
      <Alert tone="danger" title={t.insufficientTitle} action={<Button asChild size="sm" variant="secondary"><Link href="/settings?tab=plan">{t.buyCredits}</Link></Button>}>
        {fill(t.insufficientBody, { needed: formatNumber(block.needed), available: formatNumber(block.available) })}
      </Alert>
    );
  }
  return (
    <Alert tone="danger" title={t.expiredTitle} action={<Button asChild size="sm" variant="secondary"><Link href="/settings?tab=plan">{t.viewPlan}</Link></Button>}>
      {fill(t.expiredBody, { date: showDate(block.endsOn) })}
    </Alert>
  );
}

/** Hợp đồng đang ân hạn: cảnh báo, vẫn cho gửi. */
export function ContractGraceAlert({ endsOn }: { endsOn: string | null }) {
  const t = useMessages(SUBMIT_BILLING_MESSAGES);
  return <Alert tone="warning" title={t.graceTitle}>{fill(t.graceBody, { date: showDate(endsOn) })}</Alert>;
}

/** "Lô này dùng **N lượt** khi Hải quan chấp nhận khai chính thức · còn X lượt khả dụng" (gói Theo lượt). */
export function CreditsUsageLine({ sheets, available }: { sheets: number; available: number }) {
  const t = useMessages(SUBMIT_BILLING_MESSAGES);
  const [before, after = ""] = fill(t.usesLine, { available: formatNumber(available) }).split("{n}");
  return (
    <p className="text-sm text-fg-muted">
      {before}
      <strong className="font-semibold text-fg">{fill(byCount(t, "credits", sheets), { n: formatNumber(sheets) })}</strong>
      {after}
    </p>
  );
}
