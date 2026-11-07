"use client";
// Cài đặt › Gói & sử dụng (ADR 0011). PAYG: số dư / lượt đang giữ / khả dụng, mua lượt qua PayOS, quay lại từ PayOS (?payment=<id>) → đồng bộ,
// lịch sử lượt + thanh toán. CONTRACT: hợp đồng năm (số, hiệu lực, trạng thái), số tờ khai tháng này. Chung: số trang/hồ sơ, giới thiệu 2 loại gói.
import { LOW_CREDITS, MAX_CREDITS_PER_PURCHASE, type BillingOverview, type Payment } from "@kb/contracts";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, Field, Grid, Input,
  SegmentedControl, SkeletonCard, Stack, fill, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Coins, FileSignature, ShoppingCart } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { billingKeys, getBillingOverview, simulatePaymentPaid, startCreditPurchase, syncPayment } from "@/api/billing";
import { getSession, sessionKeys } from "@/api/session";
import { settingsKeys } from "@/api/settings";
import { ContractStatusBadge, CreditLedgerTable, PaymentsTable } from "@/components/common/billing-display";
import { LoadError } from "@/components/common/load-error";
import { dataSource } from "@/lib/data-source";
import { fromMinor, toMinor } from "@/lib/decimal";
import { formatDate, formatNumber, formatVnd } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { openExternal } from "@/lib/navigate";
import { errorText } from "@/lib/reason-codes";
import { PLAN_TAB_MESSAGES } from "./plan-tab.messages";
import { byCount } from "@/lib/plural";

type M = (typeof PLAN_TAB_MESSAGES)["vi"];

const QUICK = [10, 50, 100] as const;
/** Trang return: PayOS chưa xác nhận → tự hỏi lại tối đa 5 lần, mỗi 3 giây (webhook thường đến trong vài giây). */
export const PAYMENT_POLL_MS = 3000;
export const PAYMENT_MAX_POLLS = 5;

const parseCredits = (raw: string) => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN);
const validCredits = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_CREDITS_PER_PURCHASE;
const totalVnd = (unitPrice: string, n: number) => fromMinor(toMinor(unitPrice, 0) * n, 0);

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

/** Hộp "Mua lượt": chọn nhanh 10/50/100 hoặc nhập 1–1000, tổng tiền, chuyển sang trang thanh toán PayOS. */
export function BuyCreditsDialog({ open, onOpenChange, unitPrice }: { open: boolean; onOpenChange: (o: boolean) => void; unitPrice: string }) {
  const t = useMessages(PLAN_TAB_MESSAGES);
  const router = useRouter();
  const [raw, setRaw] = useState("10");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setRaw("10");
      setTouched(false);
    }
  }, [open]);
  const n = parseCredits(raw);
  const ok = validCredits(n);
  const buy = useMutation({
    mutationFn: () => startCreditPurchase({ credits: n }),
    // Bản giả lập trả đường dẫn nội bộ (/settings?tab=plan&payment=…&fake=1) → chuyển trong app; PayOS thật → rời app sang trang thanh toán.
    onSuccess: (r) => {
      if (!r.checkoutUrl.startsWith("/")) return openExternal(r.checkoutUrl);
      // Cùng trang (Cài đặt › Gói): đóng hộp rồi đổi query để phần "quay lại từ PayOS" chạy.
      onOpenChange(false);
      router.push(r.checkoutUrl);
    },
    onError: toastMutationError(t.buyFailed),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !buy.isPending && onOpenChange(o)}>
      <DialogContent title={t.buyTitle} icon={<ShoppingCart className="h-4 w-4" />} description={t.buyDesc} size="sm">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (ok) buy.mutate();
          }}
        >
          <Stack gap="md">
            <SegmentedControl<string>
              label={t.quickPick}
              value={String(n)}
              onChange={(v) => {
                setRaw(v);
                setTouched(false);
              }}
              options={QUICK.map((q) => ({ value: String(q), label: fill(t.quickOption, { n: q }) }))}
            />
            <Field label={t.creditsLabel} required hint={t.creditsHint} {...(touched && !ok ? { error: t.creditsInvalid } : {})}>
              <Input inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={() => setTouched(true)} placeholder={t.creditsPlaceholder} className="cq-sm:max-w-xs" />
            </Field>
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-surface-muted p-3">
              <div className="flex flex-col">
                <span className="text-sm text-fg-muted">{t.totalLabel}</span>
                {ok && <span className="text-xs text-fg-subtle">{fill(byCount(t, "totalLine", n), { n: formatNumber(n), price: formatVnd(unitPrice) })}</span>}
              </div>
              <output className="text-xl font-semibold tabular-nums text-fg" aria-label={t.totalLabel}>
                {ok ? formatVnd(totalVnd(unitPrice, n)) : "—"}
              </output>
            </div>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={buy.isPending}>{t.cancel}</Button>
            <Button type="submit" loading={buy.isPending} disabled={touched && !ok}>{t.payWithPayos}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ReturnState = { kind: "checking" } | { kind: "payment"; payment: Payment } | { kind: "error"; error: unknown };

/**
 * Quay lại từ PayOS (`?payment=<id>`): đồng bộ trạng thái đơn. PAID → toast + xóa query; PENDING → "đang chờ", tự hỏi lại vài lần;
 * CANCELLED / EXPIRED → báo chưa cộng lượt. Cổng giả lập (`fake=1`, không production) có nút "Giả lập đã thanh toán".
 */
export function PaymentReturn({ paymentId, fake }: { paymentId: string; fake: boolean }) {
  const t = useMessages(PLAN_TAB_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<ReturnState>({ kind: "checking" });
  const [polls, setPolls] = useState(0);
  const clearQuery = () => router.replace(`${pathname}?tab=plan`, { scroll: false });
  const settle = (p: Payment) => {
    setState({ kind: "payment", payment: p });
    if (p.status !== "PAID") return;
    void qc.invalidateQueries({ queryKey: billingKeys.overview });
    void qc.invalidateQueries({ queryKey: settingsKeys.org });
    void qc.invalidateQueries({ queryKey: sessionKeys.me });
    toast({ tone: "success", title: fill(byCount(t, "paidTitle", p.credits), { n: formatNumber(p.credits) }), description: fill(t.paidDesc, { code: p.orderCode }) });
    clearQuery();
  };
  const sync = useMutation({ mutationFn: () => syncPayment(paymentId), onSuccess: settle, onError: (error) => setState({ kind: "error", error }) });
  const simulate = useMutation({ mutationFn: () => simulatePaymentPaid(paymentId), onSuccess: settle, onError: toastMutationError(t.syncFailedTitle) });
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (started.current === paymentId) return;
    started.current = paymentId;
    setPolls(0);
    sync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);
  const pending = state.kind === "payment" && state.payment.status === "PENDING";
  useEffect(() => {
    if (!pending || polls >= PAYMENT_MAX_POLLS || sync.isPending) return;
    const id = setTimeout(() => {
      setPolls((n) => n + 1);
      sync.mutate();
    }, PAYMENT_POLL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, polls, sync.isPending]);

  if (state.kind === "checking") return <Alert tone="info" title={t.checking} />;
  if (state.kind === "error") {
    return (
      <Alert tone="danger" title={t.syncFailedTitle} action={<Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => sync.mutate()}>{t.retry}</Button>}>
        {errorText(state.error, locale)}
      </Alert>
    );
  }
  const p = state.payment;
  if (p.status === "PAID") return null;
  if (p.status === "PENDING") {
    // Cổng giả lập: bản mock và môi trường dev (backend chặn route khi production).
    const canSimulate = fake && (dataSource() === "mock" || process.env.NODE_ENV !== "production");
    const stale = polls >= PAYMENT_MAX_POLLS;
    return (
      <Alert
        tone="info"
        title={t.pendingTitle}
        action={
          <div className="flex flex-wrap gap-2">
            {stale && (
              <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => { setPolls(0); sync.mutate(); }}>
                {t.checkAgain}
              </Button>
            )}
            {canSimulate && (
              <Button size="sm" variant="secondary" loading={simulate.isPending} onClick={() => simulate.mutate()}>
                {t.simulatePaid}
              </Button>
            )}
          </div>
        }
      >
        {fill(stale ? t.pendingStale : t.pendingBody, { code: p.orderCode })}
        {canSimulate && <span className="mt-1 block text-xs">{t.simulateNote}</span>}
      </Alert>
    );
  }
  const cancelled = p.status === "CANCELLED";
  return (
    <Alert tone="warning" title={cancelled ? t.cancelledTitle : t.expiredTitle} action={<Button size="sm" variant="secondary" onClick={clearQuery}>{t.dismiss}</Button>}>
      {fill(cancelled ? t.cancelledBody : t.expiredBody, { code: p.orderCode })}
    </Alert>
  );
}

/** `canBuy`: null khi chưa tải xong phiên (chưa biết vai trò) – không hiện nút lẫn ghi chú. */
function PaygSection({ data, canBuy }: { data: BillingOverview; canBuy: boolean | null }) {
  const t = useMessages(PLAN_TAB_MESSAGES);
  const [buyOpen, setBuyOpen] = useState(false);
  const { plan, billing } = data;
  const low = billing.available <= LOW_CREDITS;
  return (
    <Stack gap="lg">
      <Grid cols={{ base: 1, lg: 3 }}>
        <Card className="cq-lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {fill(t.planTitle, { name: plan.name })} <Badge tone="primary">{t.inUse}</Badge>
            </CardTitle>
            <CardDescription>{t.paygDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm text-fg-muted">{t.balanceLabel}</p>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight text-fg">{fill(byCount(t, "balanceValue", billing.available), { n: formatNumber(billing.available) })}</p>
                  <p className="text-sm text-fg-muted">{billing.reserved > 0 ? fill(byCount(t, "reservedLine", billing.reserved), { n: formatNumber(billing.reserved) }) : t.noReserved}</p>
                </div>
                {canBuy && data.onlinePaymentEnabled && (
                  <Button leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => setBuyOpen(true)}>
                    {t.buy}
                  </Button>
                )}
              </div>
              {low && (
                <Alert tone={billing.available <= 0 ? "danger" : "warning"} title={billing.available <= 0 ? t.outTitle : t.lowTitle}>
                  {billing.available <= 0 ? t.outBody : fill(byCount(t, "lowBody", billing.available), { n: formatNumber(billing.available) })}
                </Alert>
              )}
              <div className="flex flex-col gap-1 rounded-md bg-surface-muted p-3">
                <p className="text-sm font-medium text-fg">
                  {fill(t.unitPrice, { price: formatVnd(plan.pricePerDeclarationVnd) })} · {t.unitDefinition}
                </p>
                <p className="text-xs text-fg-subtle">{t.noChargeNote}</p>
              </div>
              {/* Thanh toán online tắt (PAYMENT_PROVIDER=none): không mua được – đội vận hành nạp lượt tay. */}
              {!data.onlinePaymentEnabled && <Alert tone="info">{t.onlineOff}</Alert>}
              {data.onlinePaymentEnabled && canBuy === false && <p className="text-xs text-fg-subtle">{t.buyOnlyManagers}</p>}
            </Stack>
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle as="h3">{t.monthTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <Info label={t.declarationsThisMonth}><span className="font-semibold tabular-nums">{formatNumber(billing.declarationsThisMonth)}</span></Info>
              <Info label={t.balanceTotal}><span className="font-semibold tabular-nums">{formatNumber(billing.balance)}</span></Info>
              <Info label={t.pagesPerDossier}>{fill(t.pagesValue, { n: formatNumber(plan.pagesPerDossier) })}</Info>
            </dl>
          </CardContent>
        </Card>
      </Grid>

      <Card>
        <CardHeader>
          <CardTitle as="h3">{t.ledgerTitle}</CardTitle>
          <CardDescription>{t.ledgerDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <CreditLedgerTable entries={data.ledger} dossierHref={(id) => `/dossiers/${id}?step=submit`} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h3">{t.paymentsTitle}</CardTitle>
          <CardDescription>{t.paymentsDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentsTable payments={data.payments} />
        </CardContent>
      </Card>
      <BuyCreditsDialog open={buyOpen} onOpenChange={setBuyOpen} unitPrice={plan.pricePerDeclarationVnd} />
    </Stack>
  );
}

const requestContact = (t: M) => toast({ tone: "info", title: t.requestSent, description: t.requestSentDesc });

function ContractSection({ data }: { data: BillingOverview }) {
  const t = useMessages(PLAN_TAB_MESSAGES);
  const { plan, billing } = data;
  const c = billing.contract;
  const endsOn = c?.endsOn ? formatDate(c.endsOn) : "";
  return (
    <Grid cols={{ base: 1, lg: 3 }}>
      <Card className="cq-lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <FileSignature aria-hidden="true" className="h-5 w-5 text-primary" />
            {fill(t.planTitle, { name: plan.name })} <Badge tone="primary">{t.inUse}</Badge>
          </CardTitle>
          <CardDescription>{t.contractDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="md">
            <dl className="grid grid-cols-1 gap-4 cq-sm:grid-cols-3">
              <Info label={t.contractNo}><span className="font-mono">{c?.contractNo || "—"}</span></Info>
              <Info label={t.contractPeriod}>
                {c?.endsOn ? fill(t.contractRange, { from: c.startsOn ? formatDate(c.startsOn) : "…", to: endsOn }) : t.contractOpen}
              </Info>
              <Info label={t.contractStatus}>{c ? <ContractStatusBadge contract={c} /> : "—"}</Info>
            </dl>
            {c?.status === "EXPIRING" && <Alert tone="warning" title={t.contractExpiringTitle}>{fill(t.contractExpiringBody, { date: endsOn })}</Alert>}
            {c?.status === "GRACE" && <Alert tone="warning" title={t.contractGraceTitle}>{fill(t.contractGraceBody, { date: endsOn })}</Alert>}
            {c?.status === "EXPIRED" && <Alert tone="danger" title={t.contractExpiredTitle}>{fill(t.contractExpiredBody, { date: endsOn })}</Alert>}
          </Stack>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">{t.contactLine}</p>
          <Button variant="secondary" onClick={() => requestContact(t)}>{t.contactRenew}</Button>
        </CardFooter>
      </Card>
      <Card className="self-start">
        <CardHeader>
          <CardTitle as="h3">{t.monthTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            <Info label={t.declarationsThisMonth}><span className="font-semibold tabular-nums">{formatNumber(billing.declarationsThisMonth)}</span></Info>
            <Info label={t.pagesPerDossier}>{fill(t.pagesValue, { n: formatNumber(plan.pagesPerDossier) })}</Info>
          </dl>
        </CardContent>
      </Card>
    </Grid>
  );
}

/** Giới thiệu 2 loại gói. Giá Theo lượt lấy từ gói đang dùng (không viết cứng – tránh lệch bảng gói). */
function PlanTypes({ data }: { data: BillingOverview }) {
  const t = useMessages(PLAN_TAB_MESSAGES);
  const payg = data.plan.kind === "PAYG";
  const cards = [
    { kind: "PAYG", name: t.paygName, price: payg ? fill(t.paygPrice, { price: formatVnd(data.plan.pricePerDeclarationVnd) }) : t.paygPriceGeneric, summary: t.paygSummary, features: t.paygFeatures, icon: <Coins aria-hidden="true" className="h-5 w-5 text-primary" /> },
    { kind: "CONTRACT", name: t.contractName, price: t.contractPrice, summary: t.contractSummary, features: t.contractFeatures, icon: <FileSignature aria-hidden="true" className="h-5 w-5 text-primary" /> },
  ] as const;
  return (
    <Stack gap="sm">
      <h2 className="text-base font-semibold text-fg">{t.typesTitle}</h2>
      <Grid cols={{ base: 1, md: 2 }}>
        {cards.map((p) => {
          const current = p.kind === data.plan.kind;
          return (
            <Card key={p.kind} className={current ? "flex flex-col border-primary ring-1 ring-primary" : "flex flex-col"}>
              <CardHeader>
                <CardTitle as="h3" className="flex flex-wrap items-center gap-2">
                  {p.icon}
                  {p.name} {current && <Badge tone="primary">{t.currentPlan}</Badge>}
                </CardTitle>
                <p className="text-xl font-semibold text-fg">{p.price}</p>
                <CardDescription>{p.summary}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2">
                  {p.features.split("\n").map((f) => (
                    <li key={f} className="flex gap-2 text-sm text-fg-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              {!current && (
                <CardFooter>
                  <Button variant={p.kind === "CONTRACT" ? "primary" : "secondary"} fullWidth onClick={() => requestContact(t)}>
                    {p.kind === "CONTRACT" ? t.contactSales : t.switchToPayg}
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </Grid>
    </Stack>
  );
}

export function PlanTab() {
  const t = useMessages(PLAN_TAB_MESSAGES);
  const params = useSearchParams();
  const paymentId = params.get("payment");
  const fake = params.get("fake") === "1";
  const q = useQuery({ queryKey: billingKeys.overview, queryFn: getBillingOverview });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  const canBuy = role ? role === "OWNER" || role === "ADMIN" : null;
  return (
    <Stack gap="lg">
      {paymentId && <PaymentReturn paymentId={paymentId} fake={fake} />}
      {q.isError ? (
        <LoadError onRetry={() => void q.refetch()} title={t.loadFailed} />
      ) : !q.data ? (
        <Grid cols={{ base: 1, lg: 3 }}>
          <SkeletonCard lines={5} className="cq-lg:col-span-2" />
          <SkeletonCard lines={3} />
        </Grid>
      ) : (
        <>
          {q.data.plan.kind === "PAYG" ? <PaygSection data={q.data} canBuy={canBuy} /> : <ContractSection data={q.data} />}
          <PlanTypes data={q.data} />
        </>
      )}
    </Stack>
  );
}
