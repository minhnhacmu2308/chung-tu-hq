"use client";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Grid, PageHeader,
  Progress, Skeleton, Stack, StatCard,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, FileSearch, FolderOpen, Plus, Send } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { dossierKeys, listDossiers } from "@/api/dossiers";
import { getSession, sessionKeys } from "@/api/session";
import { ChannelBadge, DossierStatusBadge, DueBadge } from "@/features/dossiers/dossier-badges";
import { DIRECTION_LABELS, isOpen } from "@/features/dossiers/dossier-display";
import { daysUntil, formatDate, formatMoney, formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { STEP_LABELS, type Dossier } from "@/mocks/types";

const rowLink =
  "flex rounded-md px-3 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function TodoRow({ d }: { d: Dossier }) {
  return (
    <li>
      <Link href={`/dossiers/${d.id}`} className={`${rowLink} flex-col gap-2 sm:flex-row sm:items-center sm:gap-4`}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-muted">{d.code}</span>
            <Badge tone={d.direction === "NK" ? "info" : "primary"} variant="outline">{DIRECTION_LABELS[d.direction]}</Badge>
          </div>
          <p className="truncate text-sm font-medium text-fg">{d.partner}</p>
          <p className="text-xs text-fg-subtle">
            Bước: {STEP_LABELS[d.step]}
            {d.suspectFields > 0 && ` · ${d.suspectFields} trường cần kiểm tra`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DossierStatusBadge status={d.status} />
          <DueBadge dossier={d} />
          <ArrowRight className="hidden h-4 w-4 text-fg-subtle sm:block" aria-hidden="true" />
        </div>
      </Link>
    </li>
  );
}

function SectionHeader({ title, description, href, linkLabel }: { title: string; description: string; href: string; linkLabel: string }) {
  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>{linkLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </Button>
      </div>
    </CardHeader>
  );
}

export function DashboardPage() {
  const dossiers = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers() });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });

  const all = dossiers.data ?? [];
  const open = all.filter(isOpen);
  const active = open.filter((d) => d.status !== "SUBMITTED");
  const dueSoon = active.filter((d) => daysUntil(d.dueDate) <= 2);
  const overdue = dueSoon.filter((d) => daysUntil(d.dueDate) < 0);
  const suspect = open.reduce((n, d) => n + d.suspectFields, 0);
  const suspectDossiers = open.filter((d) => d.suspectFields > 0).length;
  const submitted = all.filter((d) => d.declarationNo);
  const todo = [...active].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
  const recent = [...submitted].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const firstName = session.data?.user.name.split(" ").pop();
  const org = session.data?.org;
  const usageRatio = org ? org.usage.dossiersThisMonth / org.plan.dossiersPerMonth : 0;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Tổng quan"
        description={
          firstName && dossiers.data
            ? `Chào ${firstName}, hôm nay có ${active.length} hồ sơ đang chờ xử lý.`
            : "Tình hình hồ sơ khai báo của doanh nghiệp."
        }
        actions={
          <Button asChild>
            <Link href="/dossiers/new"><Plus className="h-4 w-4" aria-hidden="true" />Tạo hồ sơ</Link>
          </Button>
        }
      />

      {dossiers.isError && (
        <Alert tone="danger" title="Không tải được dữ liệu" action={<Button size="sm" variant="secondary" onClick={() => dossiers.refetch()}>Thử lại</Button>}>
          Kiểm tra kết nối rồi thử lại.
        </Alert>
      )}

      {dossiers.isLoading ? (
        <Grid cols={{ base: 2, xl: 4 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </Grid>
      ) : (
        <Grid cols={{ base: 2, xl: 4 }} stagger>
          <StatCard
            icon={<FolderOpen />}
            label="Hồ sơ đang mở"
            value={open.length}
            hint={`${open.filter((d) => d.direction === "NK").length} nhập · ${open.filter((d) => d.direction === "XK").length} xuất`}
          />
          <StatCard
            icon={<CalendarClock />}
            tone={overdue.length > 0 ? "danger" : "warning"}
            label="Sắp hoặc quá hạn khai"
            value={dueSoon.length}
            hint={overdue.length ? `${overdue.length} hồ sơ đã quá hạn` : "Không có hồ sơ quá hạn"}
            hintTone={overdue.length > 0 ? "danger" : "default"}
          />
          <StatCard icon={<FileSearch />} tone="info" label="Trường cần kiểm tra" value={suspect} hint={`trên ${suspectDossiers} hồ sơ`} />
          <StatCard icon={<Send />} tone="success" label="Tờ khai đã truyền" value={submitted.length} hint="qua Customs Hub" />
        </Grid>
      )}

      <Grid cols={{ base: 1, lg: 3 }} gap="lg" stagger>
        <Card className="lg:col-span-2">
          <SectionHeader title="Cần xử lý" description="Sắp theo hạn khai, gần nhất lên đầu." href="/dossiers" linkLabel="Xem tất cả" />
          <CardContent>
            {dossiers.isLoading ? (
              <Stack gap="sm">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</Stack>
            ) : todo.length === 0 ? (
              <EmptyState
                title="Không còn việc tồn đọng"
                description="Mọi hồ sơ đã được xử lý. Tạo hồ sơ mới khi có lô hàng tiếp theo."
                action={<Button asChild size="sm"><Link href="/dossiers/new">Tạo hồ sơ</Link></Button>}
              />
            ) : (
              <ul className="-mx-3 flex flex-col divide-y divide-border">
                {todo.map((d) => <TodoRow key={d.id} d={d} />)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Gói dịch vụ</CardTitle>
            <CardDescription>{org ? `Gói ${org.plan.name} · gia hạn ${formatDate(org.plan.renewsAt)}` : "Đang tải…"}</CardDescription>
          </CardHeader>
          <CardContent>
            {!org ? (
              <Stack gap="sm"><Skeleton className="h-8" /><Skeleton className="h-16" /></Stack>
            ) : (
              <Stack gap="md">
                <Stack gap="xs">
                  <Progress
                    label="Hồ sơ trong tháng"
                    showValue
                    value={org.usage.dossiersThisMonth}
                    max={org.plan.dossiersPerMonth}
                    tone={usageRatio > 0.8 ? "warning" : "primary"}
                  />
                  <p className="text-xs text-fg-subtle">
                    {formatNumber(org.usage.dossiersThisMonth)} / {formatNumber(org.plan.dossiersPerMonth)} hồ sơ · tối đa {org.plan.pagesPerDossier} trang mỗi hồ sơ
                  </p>
                </Stack>
                <dl className="grid grid-cols-2 gap-3 rounded-md bg-surface-muted p-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-fg-subtle">Trang đã đọc</dt>
                    <dd className="font-semibold tabular-nums text-fg">{formatNumber(org.usage.pagesThisMonth)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-fg-subtle">Chi phí AI tháng này</dt>
                    <dd className="font-semibold tabular-nums text-fg">{formatVnd(org.usage.aiCostVnd)}</dd>
                  </div>
                </dl>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/settings">Quản lý gói</Link>
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Card>
        <SectionHeader title="Kết quả khai báo gần đây" description="Phân luồng và trạng thái từ Hải quan." href="/customs" linkLabel="Khai báo Hải quan" />
        <CardContent>
          {dossiers.isLoading ? (
            <Stack gap="sm">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</Stack>
          ) : recent.length === 0 ? (
            <EmptyState title="Chưa có tờ khai nào được truyền" description="Tờ khai đã truyền qua Customs Hub sẽ hiện ở đây kèm kết quả phân luồng." />
          ) : (
            <ul className="-mx-3 grid grid-cols-1 gap-x-6 md:grid-cols-2">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link href={`/dossiers/${d.id}?step=submit`} className={`${rowLink} items-center gap-3`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-sm font-medium text-fg">{d.partner}</p>
                      <p className="truncate text-xs text-fg-subtle">
                        <span className="font-mono">{d.declarationNo}</span> · {formatMoney(d.invoiceValue, d.currency)} · {formatRelative(d.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ChannelBadge channel={d.channel} />
                      <DossierStatusBadge status={d.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
