"use client";
import type { AdminOrgDetail } from "@kb/contracts";
import {
  Alert, Badge, Breadcrumb, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Grid, PageHeader, PageLoading, Stack,
  StatCard, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Coins, FileText, FolderOpen, Gauge, Lock, LockOpen, PlugZap, Repeat, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { adminKeys, getAdminOrg, listAdminUsers } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { ApiError } from "@/lib/api-error";
import { daysUntil, formatDate, formatDateTime, formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { AuditTable } from "../audit/audit-table";
import { INTEGRATION_STATUS, ORG_STATUS, PLAN_TONE } from "../common/admin-display";
import { QuotaMeter } from "../common/quota-meter";
import { useAdminSession } from "../shell/use-admin-session";
import { UserTable } from "../users/user-table";
import { OrgActionDialogs, type OrgAction } from "./org-actions";

const TABS = [
  { id: "overview", label: "Tổng quan" },
  { id: "members", label: "Thành viên" },
  { id: "plan", label: "Gói & sử dụng" },
  { id: "connections", label: "Kết nối & chứng thư" },
  { id: "audit", label: "Nhật ký" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

function OverviewTab({ org }: { org: AdminOrgDetail }) {
  return (
    <Stack gap="lg">
      <Grid cols={{ base: 2, xl: 4 }}>
        <StatCard icon={<UsersRound />} label="Thành viên" value={org.memberCount} hint={org.lastActiveAt ? `hoạt động ${formatRelative(org.lastActiveAt)}` : "chưa ai đăng nhập"} />
        <StatCard icon={<FolderOpen />} tone="success" label="Hồ sơ tháng này" value={org.usage.dossiersThisMonth} hint={`hạn mức ${formatNumber(org.plan.dossiersPerMonth + org.quotaBonus)}`} />
        <StatCard icon={<FileText />} tone="info" label="Trang đã đọc" value={org.usage.pagesThisMonth} hint="trong tháng này" />
        <StatCard icon={<Coins />} tone="warning" label="Chi phí AI tháng này" value={formatVnd(org.usage.aiCostVnd)} hint="giá vốn, đã gồm trong giá gói" />
      </Grid>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Thông tin doanh nghiệp</CardTitle>
          <CardDescription>Doanh nghiệp tự khai và tự sửa trong màn Tài khoản & tích hợp. MST không đổi được.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 cq-sm:grid-cols-2">
            <Info label="Mã số thuế"><span className="font-mono">{org.taxCode}</span></Info>
            <Info label="Số điện thoại">{org.phone || "—"}</Info>
            <div className="cq-sm:col-span-2"><Info label="Địa chỉ">{org.address || "—"}</Info></div>
            <Info label="Chủ sở hữu">
              {org.ownerName}
              {org.ownerEmail && <span className="block break-all text-xs text-fg-subtle">{org.ownerEmail}</span>}
            </Info>
            <Info label="Ngày đăng ký">{formatDateTime(org.createdAt)}</Info>
          </dl>
        </CardContent>
      </Card>
    </Stack>
  );
}

function PlanTab({ org, onAction }: { org: AdminOrgDetail; onAction: (a: OrgAction) => void }) {
  const { can } = useAdminSession();
  const days = daysUntil(org.plan.renewsAt);
  const trial = org.plan.code === "TRIAL";
  return (
    <Stack gap="md" className="max-w-4xl">
      {days <= 7 && (
        <Alert tone={days < 0 ? "danger" : "warning"} title={`${trial ? "Dùng thử" : "Gói"} ${days < 0 ? `đã hết hạn ${-days} ngày` : days === 0 ? "hết hạn hôm nay" : `hết hạn sau ${days} ngày`}`}>
          {trial ? "Liên hệ khách để chuyển sang gói trả phí, hoặc gia hạn dùng thử nếu họ chưa thử đủ luồng." : "Tới kỳ gia hạn – kiểm tra thanh toán với khách."}
        </Alert>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                Gói {org.plan.name} <Badge tone={PLAN_TONE[org.plan.code]}>{trial ? "Dùng thử" : "Đang dùng"}</Badge>
              </CardTitle>
              <CardDescription>
                {trial ? "Dùng thử tới" : "Gia hạn ngày"} {formatDate(org.plan.renewsAt)} · tối đa {org.plan.pagesPerDossier} trang mỗi hồ sơ
              </CardDescription>
            </div>
            {can("BILLING") && (
              <div className="flex flex-wrap gap-2">
                {trial && <Button size="sm" variant="secondary" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => onAction("trial")}>Gia hạn dùng thử</Button>}
                <Button size="sm" variant="secondary" leftIcon={<Gauge className="h-4 w-4" />} onClick={() => onAction("quota")}>Nới hạn mức</Button>
                <Button size="sm" leftIcon={<Repeat className="h-4 w-4" />} onClick={() => onAction("plan")}>Đổi gói</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Stack gap="md">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-fg">Hồ sơ tháng này</p>
              <QuotaMeter used={org.usage.dossiersThisMonth} limit={org.plan.dossiersPerMonth} bonus={org.quotaBonus} />
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-md bg-surface-muted p-3 cq-sm:grid-cols-3">
              <Info label="Trang đã đọc"><span className="font-semibold tabular-nums">{formatNumber(org.usage.pagesThisMonth)}</span></Info>
              <Info label="Chi phí AI"><span className="font-semibold tabular-nums">{formatVnd(org.usage.aiCostVnd)}</span></Info>
              <Info label="Chi phí / hồ sơ">
                <span className="font-semibold tabular-nums">
                  {org.usage.dossiersThisMonth > 0 ? formatVnd(String(Math.round(Number(org.usage.aiCostVnd) / org.usage.dossiersThisMonth))) : "—"}
                </span>
              </Info>
            </dl>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function ConnectionsTab({ org }: { org: AdminOrgDetail }) {
  const empty = org.integrations.length === 0 && org.certificates.length === 0;
  return (
    <Stack gap="md" className="max-w-4xl">
      <Alert tone="info" title="Chỉ có trạng thái">
        Đội vận hành thấy kết nối nào đang lỗi và chứng thư nào sắp hết hạn để chủ động báo khách. Khóa, số serial và nội dung thông điệp Hải quan không hiện ở đây.
      </Alert>
      {empty ? (
        <Card><EmptyState icon={<PlugZap />} title="Doanh nghiệp chưa cấu hình kết nối nào" description="Khi doanh nghiệp bật kết nối hoặc thêm chứng thư số, trạng thái sẽ hiện ở đây." /></Card>
      ) : (
        <Grid cols={{ base: 1, lg: 2 }}>
          <Card>
            <CardHeader><CardTitle>Kết nối hệ thống</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border border-t border-border">
                {org.integrations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="text-sm text-fg">{i.name}</span>
                    <StatusBadge status={INTEGRATION_STATUS[i.status]} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Chứng thư số</CardTitle></CardHeader>
            <CardContent className="p-0">
              {org.certificates.length === 0 ? (
                <EmptyState className="py-8" icon={<ShieldCheck />} title="Chưa có chứng thư số" />
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {org.certificates.map((c) => {
                    const d = daysUntil(c.validTo);
                    return (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                        <span className="flex flex-wrap items-center gap-2 text-sm text-fg">
                          {c.issuer} {c.isDefault && <Badge tone="primary" size="sm">Mặc định</Badge>}
                        </span>
                        <Badge tone={d < 0 ? "danger" : d <= 30 ? "warning" : "success"}>
                          {d < 0 ? `Hết hạn ${formatDate(c.validTo)}` : d <= 30 ? `Còn ${d} ngày` : `Hiệu lực tới ${formatDate(c.validTo)}`}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </Grid>
      )}
    </Stack>
  );
}

function DetailInner({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "overview";
  const { can } = useAdminSession();
  const org = useQuery({ queryKey: adminKeys.org(id), queryFn: () => getAdminOrg(id), retry: false });
  const members = useQuery({ queryKey: adminKeys.users({ orgId: id }), queryFn: () => listAdminUsers({ orgId: id }), enabled: tab === "members" });
  const [action, setAction] = useState<OrgAction | null>(null);

  if (org.isError) {
    const missing = org.error instanceof ApiError && org.error.code === "NOT_FOUND";
    return missing ? (
      <EmptyState
        title="Không tìm thấy doanh nghiệp"
        description="Đường dẫn không đúng hoặc doanh nghiệp không còn trên hệ thống."
        action={<Button asChild><Link href="/admin/orgs">Về danh sách doanh nghiệp</Link></Button>}
      />
    ) : (
      <LoadError onRetry={() => void org.refetch()} title="Không tải được doanh nghiệp" />
    );
  }
  if (!org.data) return <PageLoading variant="detail" />;
  const o = org.data;

  return (
    <Stack gap="lg">
      <Breadcrumb linkAs={Link} items={[{ label: "Doanh nghiệp", href: "/admin/orgs" }, { label: o.name }]} />
      <PageHeader
        title={o.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ORG_STATUS[o.status]} />
            <Badge tone={PLAN_TONE[o.plan.code]}>{o.plan.name}</Badge>
            <span>MST <span className="font-mono">{o.taxCode}</span></span>
          </span>
        }
        actions={
          can("SUPPORT") &&
          (o.status === "ACTIVE" ? (
            <Button variant="secondary" leftIcon={<Lock className="h-4 w-4" />} onClick={() => setAction("suspend")}>Tạm khóa</Button>
          ) : (
            <Button leftIcon={<LockOpen className="h-4 w-4" />} onClick={() => setAction("reactivate")}>Mở khóa</Button>
          ))
        }
      />

      {o.status === "SUSPENDED" && (
        <Alert tone="danger" title="Doanh nghiệp đang bị tạm khóa">
          Lý do: {o.suspendedReason ?? "không ghi"}. Thành viên không dùng được hệ thống cho tới khi mở khóa.
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(t) => router.replace(t === "overview" ? pathname : `${pathname}?tab=${t}`, { scroll: false })}>
        <TabsList aria-label="Mục của doanh nghiệp">
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="overview"><OverviewTab org={o} /></TabsContent>
        <TabsContent value="members">
          {members.isError ? (
            <LoadError onRetry={() => void members.refetch()} title="Không tải được thành viên" />
          ) : (
            <UserTable users={members.data ?? []} loading={members.isLoading} showOrg={false} emptyTitle="Doanh nghiệp chưa có thành viên" />
          )}
        </TabsContent>
        <TabsContent value="plan"><PlanTab org={o} onAction={setAction} /></TabsContent>
        <TabsContent value="connections"><ConnectionsTab org={o} /></TabsContent>
        <TabsContent value="audit"><AuditTable orgId={o.id} /></TabsContent>
      </Tabs>

      <OrgActionDialogs org={o} action={action} onClose={() => setAction(null)} />
    </Stack>
  );
}

export function OrgDetailPage({ id }: { id: string }) {
  return (
    <Suspense>
      <DetailInner id={id} />
    </Suspense>
  );
}
