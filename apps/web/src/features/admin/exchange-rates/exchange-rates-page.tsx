"use client";
// Khu Quản trị → Tỷ giá tính thuế (BACKEND-TODO D2): tỷ giá theo tuần, lần lấy Vietcombank gần nhất, thêm/sửa tay kèm lý do.
import { UpsertExchangeRateInputSchema, type ExchangeRate, type ExchangeRateSource } from "@kb/contracts";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, EmptyState, Field, Grid, Input,
  PageHeader, Select, SkeletonCard, SkeletonTable, Stack, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Landmark, PencilLine } from "lucide-react";
import { useState } from "react";
import { adminKeys, listExchangeRates, upsertExchangeRate } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { editableWeeks } from "./weeks";

const SOURCE: Record<ExchangeRateSource, { label: string; tone: "primary" | "warning" | "neutral" }> = {
  VCB: { label: "Vietcombank", tone: "primary" },
  MANUAL: { label: "Nhập tay", tone: "warning" },
  SEED: { label: "Dữ liệu mẫu", tone: "neutral" },
};

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** "19/10 – 25/10"; ngày hiệu lực không phải thứ Hai (dữ liệu mẫu cũ) → "Từ 14/10". */
const weekLabel = (from: string) =>
  new Date(`${from}T00:00:00Z`).getUTCDay() === 1 ? `${formatDate(from).slice(0, 5)} – ${formatDate(addDays(from, 6)).slice(0, 5)}` : `Từ ${formatDate(from).slice(0, 5)}`;

const col = createDataTableColumnHelper<ExchangeRate>();
const COLUMNS = col.columns([
  col.accessor("currency", { header: "Ngoại tệ", meta: { sticky: true }, cell: (c) => <span className="font-mono font-medium">{c.getValue()}</span> }),
  col.accessor("rate", { header: "Tỷ giá (VND)", meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatMoney(c.getValue())}</span> }),
  col.accessor("source", { header: "Nguồn", cell: (c) => <Badge tone={SOURCE[c.getValue()].tone} variant="outline" size="sm">{SOURCE[c.getValue()].label}</Badge> }),
  col.display({
    id: "detail",
    header: "Chi tiết",
    meta: { wrap: true },
    cell: (c) => {
      const r = c.row.original;
      if (r.source === "VCB") return <span className="text-xs text-fg-muted">{r.snapshotAt ? `Bảng Vietcombank lúc ${formatDateTime(r.snapshotAt)}` : "—"}</span>;
      if (r.source === "MANUAL") return <span className="text-xs text-fg-muted">{[r.updatedByName, r.note].filter(Boolean).join(" · ") || "—"}</span>;
      return <span className="text-xs text-fg-subtle">—</span>;
    },
  }),
]);

function UpsertDialog({ open, onClose, weeks }: { open: boolean; onClose: () => void; weeks: string[] }) {
  const [currency, setCurrency] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(weeks[0] ?? "");
  const [rate, setRate] = useState("");
  const draft = { currency, effectiveFrom, rate: rate.replace(/,/g, "").trim(), reason: "Kiểm tra định dạng" };
  const check = UpsertExchangeRateInputSchema.safeParse(draft);
  const fieldError = (f: "currency" | "rate") => {
    if (!check.success && (f === "currency" ? currency : rate)) return check.error.issues.find((i) => i.path[0] === f)?.message;
    return undefined;
  };
  const save = useAdminMutation({
    mutationFn: (reason: string) => upsertExchangeRate({ ...draft, reason }),
    success: (r) => `Đã lưu tỷ giá ${r.currency} tuần ${weekLabel(r.effectiveFrom)}`,
    errorTitle: "Không lưu được tỷ giá",
    onSuccess: () => {
      setCurrency("");
      setRate("");
      onClose();
    },
  });
  const currencyError = fieldError("currency");
  const rateError = fieldError("rate");
  return (
    <ReasonDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Thêm / sửa tỷ giá tính thuế"
      icon={<PencilLine className="h-4 w-4" />}
      description="Giá trị nhập tay được giữ nguyên, lần lấy tự động từ Vietcombank không ghi đè."
      confirmLabel="Lưu tỷ giá"
      pending={save.isPending}
      canSubmit={check.success}
      onConfirm={(reason) => save.mutate(reason)}
    >
      <Grid cols={{ base: 1, md: 2 }}>
        <Field label="Ngoại tệ" required hint="Mã ISO 3 chữ: USD, EUR, TWD…" {...(currencyError ? { error: currencyError } : {})}>
          <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="font-mono" />
        </Field>
        <Field label="Áp dụng cho tuần" required>
          <Select value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} options={weeks.map((w) => ({ value: w, label: `Tuần ${weekLabel(w)}` }))} />
        </Field>
        <Field label="Tỷ giá (VND / 1 đơn vị ngoại tệ)" required hint="Dấu chấm thập phân, vd 805.12" {...(rateError ? { error: rateError } : {})}>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="tabular-nums" />
        </Field>
      </Grid>
    </ReasonDialog>
  );
}

export function ExchangeRatesPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.exchangeRates, queryFn: listExchangeRates });
  const { can } = useAdminSession();
  const [tab, setTab] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const weeks = data?.weeks ?? [];
  const current = tab && weeks.some((w) => w.effectiveFrom === tab) ? tab : weeks[0]?.effectiveFrom;
  const editable = editableWeeks(new Date(), weeks.map((w) => w.effectiveFrom));
  const last = data?.lastFetch;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Tỷ giá tính thuế"
        description="Tỷ giá mua chuyển khoản của Hội sở chính Vietcombank cuối ngày thứ Năm tuần trước, áp cho mọi tờ khai đăng ký trong tuần (Điều 21 khoản 5 NĐ 08/2015, sửa bởi NĐ 167/2025)."
        actions={can("PLATFORM") ? <Button leftIcon={<PencilLine className="h-4 w-4" />} onClick={() => setEditing(true)} disabled={!data}>Thêm / sửa tỷ giá</Button> : undefined}
      />
      {isError ? (
        <LoadError onRetry={() => void refetch()} title="Không tải được tỷ giá" />
      ) : isLoading || !data ? (
        <>
          <Grid cols={{ base: 1, lg: 2 }}>{[0, 1].map((i) => <SkeletonCard key={i} lines={3} />)}</Grid>
          <SkeletonTable rows={8} />
        </>
      ) : (
        <>
          <Grid cols={{ base: 1, lg: 2 }}>
            <Card>
              <CardHeader>
                <CardTitle as="h3" className="flex items-center gap-2"><Landmark aria-hidden="true" className="h-4 w-4 text-fg-muted" />Lần lấy gần nhất</CardTitle>
                <CardDescription>Tự động từ bảng tỷ giá công khai của Vietcombank.</CardDescription>
              </CardHeader>
              <CardContent>
                {last ? (
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={last.status === "OK" ? "PASS" : "FAIL"} label={last.status === "OK" ? "Thành công" : "Lỗi"} />
                      <span className="text-sm text-fg-muted">{formatDateTime(last.ranAt)} · tuần {weekLabel(last.effectiveFrom)}</span>
                    </div>
                    {last.status === "OK" ? (
                      <p className="text-sm text-fg-muted">{last.count} ngoại tệ · bảng Vietcombank lúc {last.boardAt ? formatDateTime(last.boardAt) : "—"}</p>
                    ) : (
                      <Alert tone="danger">{last.error ?? "Không rõ lỗi"} – nhập tay tỷ giá tuần này bằng nút “Thêm / sửa tỷ giá”.</Alert>
                    )}
                  </Stack>
                ) : (
                  <p className="text-sm text-fg-muted">Chưa chạy lần nào.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle as="h3" className="flex items-center gap-2"><CalendarClock aria-hidden="true" className="h-4 w-4 text-fg-muted" />Lần chạy kế tiếp</CardTitle>
                <CardDescription>Thứ Năm 23:30 giờ Việt Nam; lỗi thì thử lại mỗi 30 phút tới sáng thứ Sáu.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-fg">{formatDateTime(data.nextRunAt)}</p>
                <p className="mt-1 text-xs text-fg-subtle">Ngoại tệ Vietcombank không công bố (vd TWD): nhập tay tỷ giá chéo do Ngân hàng Nhà nước công bố.</p>
              </CardContent>
            </Card>
          </Grid>
          {weeks.length === 0 ? (
            <EmptyState title="Chưa có tỷ giá" description="Tỷ giá sẽ có sau lần chạy tự động tối thứ Năm, hoặc nhập tay ngay." />
          ) : (
            <Tabs value={current ?? ""} onValueChange={setTab}>
              <TabsList aria-label="Tuần áp dụng">
                {weeks.map((w) => <TabsTrigger key={w.effectiveFrom} value={w.effectiveFrom}>{weekLabel(w.effectiveFrom)}</TabsTrigger>)}
              </TabsList>
              {weeks.map((w) => (
                <TabsContent key={w.effectiveFrom} value={w.effectiveFrom} className="pt-4">
                  <DataTable aria-label={`Tỷ giá tuần ${weekLabel(w.effectiveFrom)}`} columns={COLUMNS} data={w.rates} getRowId={(r) => r.currency} searchable pagination={false} emptyTitle="Không có tỷ giá" />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </>
      )}
      {editing && <UpsertDialog open onClose={() => setEditing(false)} weeks={editable} />}
    </Stack>
  );
}
