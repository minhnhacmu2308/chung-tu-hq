"use client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Grid, Progress, Skeleton, Stack, toast } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { getOrganization, settingsKeys } from "@/api/settings";
import { formatDate, formatNumber, formatVnd } from "@/lib/format";
import type { Organization } from "@/mocks/types";

type PlanCode = Organization["plan"]["code"];
const PLANS: { code: PlanCode; name: string; price: string; dossiers: string; features: string[] }[] = [
  {
    code: "BASIC",
    name: "Cơ bản",
    price: "1.490.000 đ/tháng",
    dossiers: "50 hồ sơ/tháng · 20 trang/hồ sơ",
    features: ["AI đọc + đối chiếu chéo", "Màn kiểm tra & xác nhận", "Xuất JSON / Excel", "3 thành viên"],
  },
  {
    code: "PRO",
    name: "Chuyên nghiệp",
    price: "3.990.000 đ/tháng",
    dossiers: "150 hồ sơ/tháng · 40 trang/hồ sơ",
    features: ["Mọi thứ của gói Cơ bản", "Skill riêng theo nhà cung cấp", "Gợi ý mã HS (hscodepro)", "Dựng tờ khai IDA/EDA", "Lịch sử & nhật ký sửa", "10 thành viên"],
  },
  {
    code: "ENTERPRISE",
    name: "Doanh nghiệp",
    price: "Liên hệ",
    dossiers: "Theo hợp đồng",
    features: ["Mọi thứ của gói Chuyên nghiệp", "Truyền Hải quan qua Customs Hub", "Kết nối API / ERP", "SLA & hỗ trợ riêng", "Không giới hạn thành viên"],
  },
];

function Meter({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = Math.round((used / total) * 100);
  return (
    <Stack gap="xs">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="text-fg-muted">
          {formatNumber(used)} / {formatNumber(total)} {unit}
        </span>
      </div>
      <Progress value={pct} tone={pct >= 90 ? "danger" : pct >= 75 ? "warning" : "primary"} aria-label={`${label}: đã dùng ${pct}%`} />
    </Stack>
  );
}

export function PlanTab() {
  const { data: org, isLoading } = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  if (isLoading || !org) return <Skeleton className="h-96" />;
  const { plan, usage } = org;
  const avgCost = usage.dossiersThisMonth ? Math.round(Number(usage.aiCostVnd) / usage.dossiersThisMonth) : 0;

  return (
    <Stack gap="lg">
      <Grid cols={{ base: 1, lg: 3 }}>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Gói {plan.name} <Badge tone="primary">Đang dùng</Badge>
            </CardTitle>
            <CardDescription>Gia hạn ngày {formatDate(plan.renewsAt)} · hạn mức tính theo tháng, đặt lại khi gia hạn.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              <Meter label="Hồ sơ tháng này" used={usage.dossiersThisMonth} total={plan.dossiersPerMonth} unit="hồ sơ" />
              <Meter label="Trang đã đọc" used={usage.pagesThisMonth} total={plan.dossiersPerMonth * 8} unit="trang (ước tính 8 trang/hồ sơ)" />
              <p className="text-xs text-fg-subtle">
                Mỗi hồ sơ tối đa {plan.pagesPerDossier} trang. Vượt hạn mức vẫn dùng được, tính thêm theo hồ sơ ở kỳ thanh toán sau.
              </p>
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Chi phí AI tháng này</CardDescription>
            <CardTitle as="h3" className="text-2xl">{formatVnd(usage.aiCostVnd)}</CardTitle>
            <p className="text-xs text-fg-subtle">≈ {formatVnd(String(avgCost))} / hồ sơ · đã gồm trong giá gói</p>
          </CardHeader>
          <CardContent>
            <Alert tone="info">Chi phí đọc chứng từ do KhaiBáo AI chịu theo gói. Số liệu chỉ để doanh nghiệp theo dõi.</Alert>
          </CardContent>
        </Card>
      </Grid>

      <Stack gap="sm">
        <h2 className="text-base font-semibold text-fg">So sánh gói</h2>
        <Grid cols={{ base: 1, md: 3 }}>
          {PLANS.map((p) => {
            const current = p.code === plan.code;
            return (
              <Card key={p.code} className={current ? "flex flex-col border-primary ring-1 ring-primary" : "flex flex-col"}>
                <CardHeader>
                  <CardTitle>
                    {p.name} {current && <Badge tone="primary">Gói hiện tại</Badge>}
                  </CardTitle>
                  <p className="text-xl font-semibold text-fg">{p.price}</p>
                  <CardDescription>{p.dossiers}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2 text-sm text-fg-muted">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {current ? (
                    <Button variant="secondary" fullWidth disabled>Đang dùng</Button>
                  ) : (
                    <Button
                      variant={p.code === "ENTERPRISE" ? "primary" : "secondary"}
                      fullWidth
                      onClick={() => toast({ tone: "info", title: "Đã gửi yêu cầu đổi gói", description: "Bộ phận kinh doanh sẽ liên hệ trong 1 ngày làm việc." })}
                    >
                      {p.code === "ENTERPRISE" ? "Liên hệ tư vấn" : "Chuyển sang gói này"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </Grid>
      </Stack>
    </Stack>
  );
}
