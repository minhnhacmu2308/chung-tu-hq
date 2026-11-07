"use client";
// Hiển thị chung của gói dịch vụ (ADR 0011) cho cả Cài đặt › Gói & sử dụng (khách) và tab Gói của khu Quản trị:
// trạng thái hợp đồng, loại dòng sổ lượt, bảng sổ lượt, bảng thanh toán. Chỉ ghép từ @kb/ui.
import type { ContractStatus, CreditLedgerEntry, CreditReason, OrgContract, Payment, PaymentStatus } from "@kb/contracts";
import { Badge, createDataTableColumnHelper, DataTable, fill, StatusBadge, useMessages, type Status, type Tone } from "@kb/ui";
import Link from "next/link";
import { useMemo } from "react";
import { formatDateTime, formatNumber, formatVnd } from "@/lib/format";
import { BILLING_DISPLAY_MESSAGES, CREDIT_REASON_LABELS } from "./billing-display.messages";
import { byCount } from "@/lib/plural";

export const CONTRACT_STATUS = {
  ACTIVE: "CONTRACT_ACTIVE",
  EXPIRING: "CONTRACT_EXPIRING",
  GRACE: "CONTRACT_GRACE",
  EXPIRED: "CONTRACT_EXPIRED",
} as const satisfies Record<ContractStatus, Status>;

export const PAYMENT_STATUS = {
  PENDING: "PAYMENT_PENDING",
  PAID: "PAYMENT_PAID",
  CANCELLED: "PAYMENT_CANCELLED",
  EXPIRED: "PAYMENT_EXPIRED",
} as const satisfies Record<PaymentStatus, Status>;

/** Loại dòng sổ lượt là nhãn phân loại (Badge), không phải trạng thái nghiệp vụ. */
const REASON_TONE: Record<CreditReason, Tone> = {
  PURCHASE: "success", MANUAL_TOPUP: "success", GRANT: "info", CHARGE: "neutral", CONTRACT_USE: "neutral", REFUND: "warning", ADJUST: "warning",
};

/** Trạng thái hợp đồng kèm số ngày: "Sắp hết hạn · còn 12 ngày", "Ân hạn · quá hạn 3 ngày". */
export function ContractStatusBadge({ contract }: { contract: Pick<OrgContract, "status" | "daysLeft"> }) {
  const t = useMessages(BILLING_DISPLAY_MESSAGES);
  const d = contract.daysLeft ?? 0;
  const label =
    contract.status === "EXPIRING" ? (d === 0 ? t.expiringToday : fill(byCount(t, "expiringIn", d), { n: d })) : contract.status === "GRACE" ? fill(byCount(t, "graceDays", -d), { n: -d }) : undefined;
  return <StatusBadge status={CONTRACT_STATUS[contract.status]} {...(label ? { label } : {})} />;
}

export function CreditReasonBadge({ reason }: { reason: CreditReason }) {
  const labels = useMessages(CREDIT_REASON_LABELS);
  return <Badge tone={REASON_TONE[reason]} size="sm">{labels[reason]}</Badge>;
}

/** "+20" / "−1" / "0" – có dấu, không chỉ dựa vào màu. */
export const signedCredits = (n: number) => (n > 0 ? `+${formatNumber(n)}` : n < 0 ? `−${formatNumber(-n)}` : "0");

const ledgerCol = createDataTableColumnHelper<CreditLedgerEntry>();

/**
 * Bảng sổ lượt. `dossierHref`: đường dẫn hồ sơ của tờ khai (app khách); không truyền (khu Quản trị – không xem nội dung hồ sơ) thì chỉ hiện số.
 * Ghi chú của dòng hệ thống tự ghi được dịch theo loại; ghi chú do người nhập giữ nguyên.
 */
export function CreditLedgerTable({ entries, loading = false, dossierHref }: { entries: CreditLedgerEntry[]; loading?: boolean; dossierHref?: (dossierId: string) => string }) {
  const t = useMessages(BILLING_DISPLAY_MESSAGES);
  const columns = useMemo(
    () =>
      ledgerCol.columns([
        ledgerCol.accessor("at", { header: t.colAt, size: 170, cell: (c) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(c.getValue())}</span> }),
        ledgerCol.accessor("reason", { header: t.colKind, size: 150, cell: (c) => <CreditReasonBadge reason={c.getValue()} /> }),
        ledgerCol.accessor("delta", {
          header: t.colDelta,
          size: 110,
          meta: { align: "end" },
          cell: (c) => (
            <span className={c.getValue() > 0 ? "font-semibold tabular-nums text-success-subtle-fg" : "font-semibold tabular-nums text-fg"}>{signedCredits(c.getValue())}</span>
          ),
        }),
        ledgerCol.accessor((e) => e.declarationNo ?? "", {
          id: "declaration",
          header: t.colDeclaration,
          size: 190,
          meta: { label: t.colDeclaration },
          cell: (c) => {
            const e = c.row.original;
            if (!e.declarationNo) return <span className="text-fg-subtle">—</span>;
            const text = (
              <>
                <span className="font-mono">{e.declarationNo}</span>
                {e.branch && e.branch > 1 && <span className="text-fg-subtle"> · {fill(t.sheet, { no: e.branch })}</span>}
              </>
            );
            return dossierHref && e.dossierId ? (
              <Link href={dossierHref(e.dossierId)} className="text-primary hover:underline" aria-label={fill(t.openDossier, { no: e.declarationNo })}>
                {text}
              </Link>
            ) : (
              <span>{text}</span>
            );
          },
        }),
        ledgerCol.accessor((e) => Number(e.amountVnd), {
          id: "amount",
          header: t.colAmount,
          size: 140,
          meta: { align: "end", label: t.colAmount },
          cell: (c) => <span className="tabular-nums">{c.getValue() === 0 ? "—" : formatVnd(c.row.original.amountVnd)}</span>,
        }),
        ledgerCol.accessor((e) => e.note ?? "", {
          id: "note",
          header: t.colNote,
          size: 280,
          meta: { label: t.colNote },
          cell: (c) => {
            const e = c.row.original;
            const system = e.createdBy === "system";
            const text =
              system && (e.reason === "CHARGE" || e.reason === "CONTRACT_USE") ? t.noteCharge : system && e.reason === "PURCHASE" ? t.notePurchase : system && e.reason === "GRANT" ? t.noteGrant : e.note;
            return <span className="text-fg-muted">{text || "—"}</span>;
          },
        }),
      ]),
    [t, dossierHref],
  );
  return (
    <DataTable
      aria-label={t.ledgerLabel}
      columns={columns}
      data={entries}
      getRowId={(e) => e.id}
      loading={loading}
      emptyTitle={t.ledgerEmpty}
      emptyDescription={t.ledgerEmptyDesc}
      pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20, 50] }}
    />
  );
}

const payCol = createDataTableColumnHelper<Payment>();

export function PaymentsTable({ payments, loading = false }: { payments: Payment[]; loading?: boolean }) {
  const t = useMessages(BILLING_DISPLAY_MESSAGES);
  const columns = useMemo(
    () =>
      payCol.columns([
        payCol.accessor((p) => String(p.orderCode), { id: "orderCode", header: t.colOrderCode, size: 170, meta: { label: t.colOrderCode }, cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
        payCol.accessor("credits", { header: t.colCredits, size: 110, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{fill(byCount(t, "creditsN", c.getValue()), { n: formatNumber(c.getValue()) })}</span> }),
        payCol.accessor((p) => Number(p.amountVnd), {
          id: "amount",
          header: t.colAmount,
          size: 140,
          meta: { align: "end", label: t.colAmount },
          cell: (c) => <span className="tabular-nums">{formatVnd(c.row.original.amountVnd)}</span>,
        }),
        payCol.accessor("status", { header: t.colStatus, size: 160, cell: (c) => <StatusBadge status={PAYMENT_STATUS[c.getValue()]} /> }),
        payCol.accessor("createdAt", { header: t.colCreated, size: 170, cell: (c) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(c.getValue())}</span> }),
        payCol.accessor((p) => p.paidAt ?? "", {
          id: "paidAt",
          header: t.colPaid,
          size: 170,
          meta: { label: t.colPaid },
          cell: (c) => <span className="whitespace-nowrap text-fg-muted">{c.getValue() ? formatDateTime(c.getValue()) : "—"}</span>,
        }),
      ]),
    [t],
  );
  return (
    <DataTable
      aria-label={t.paymentsLabel}
      columns={columns}
      data={payments}
      getRowId={(p) => p.id}
      loading={loading}
      emptyTitle={t.paymentsEmpty}
      // Chỉ vài chục đơn gần nhất; tắt phân trang để trang có một vùng "Phân trang" (bảng sổ lượt) – axe landmark-unique.
      pagination={false}
    />
  );
}
