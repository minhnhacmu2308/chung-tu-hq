"use client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Grid, IconTile, Skeleton, Stack, toast } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Building2, FileSpreadsheet, KeyRound, PlugZap, Search } from "lucide-react";
import type { ReactNode } from "react";
import { listIntegrations, settingsKeys, testIntegration } from "@/api/settings";
import { formatRelative } from "@/lib/format";
import type { Integration } from "@/mocks/types";
import { LoadError } from "@/components/common/load-error";
import { VnaccsAccountSection } from "./vnaccs-account";

const STATUS: Record<Integration["status"], { tone: "success" | "danger" | "neutral"; label: string }> = {
  CONNECTED: { tone: "success", label: "Đã kết nối" },
  ERROR: { tone: "danger", label: "Lỗi kết nối" },
  NOT_CONFIGURED: { tone: "neutral", label: "Chưa cấu hình" },
};
const ICON: Record<Integration["id"], ReactNode> = {
  HSCODEPRO: <Search />,
  CUSTOMS_HUB: <Building2 />,
  AI_PROVIDER: <Bot />,
  EINVOICE: <FileSpreadsheet />,
};

function IntegrationCard({ it }: { it: Integration }) {
  const qc = useQueryClient();
  const test = useMutation({
    mutationFn: () => testIntegration(it.id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.integrations });
      toast(r.status === "CONNECTED" ? { tone: "success", title: `${r.name}: kết nối tốt` } : { tone: "danger", title: `${r.name}: lỗi`, description: r.detail ?? "" });
    },
    onError: (e: Error) => toast({ tone: "warning", title: it.name, description: e.message }),
  });
  const s = STATUS[it.status];
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTile icon={ICON[it.id]} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h3">{it.name}</CardTitle>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            <CardDescription>{it.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <Stack gap="sm">
          {it.status === "ERROR" && it.detail ? (
            <Alert tone="danger">{it.detail}</Alert>
          ) : it.detail ? (
            <p className="text-sm text-fg-muted">{it.detail}</p>
          ) : (
            <p className="text-sm text-fg-subtle">Chưa bật cho doanh nghiệp. Liên hệ quản trị KhaiBáo AI để kích hoạt.</p>
          )}
          {it.id === "CUSTOMS_HUB" && <VnaccsAccountSection />}
        </Stack>
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-xs text-fg-subtle">{it.lastCheckedAt ? `Kiểm tra ${formatRelative(it.lastCheckedAt)}` : "Chưa kiểm tra"}</span>
        <Button size="sm" variant="secondary" leftIcon={<PlugZap className="h-4 w-4" />} loading={test.isPending} onClick={() => test.mutate()}>
          Kiểm tra kết nối
        </Button>
      </CardFooter>
    </Card>
  );
}

export function IntegrationsTab() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.integrations, queryFn: listIntegrations });
  return (
    <Stack gap="md">
      <Alert tone="info" title="Khóa API được giữ ở máy chủ">
        <span className="inline-flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Khóa của hscodepro, Customs Hub, dịch vụ AI và mật khẩu VNACCS lưu mã hóa phía máy chủ, không bao giờ gửi xuống trình duyệt hay hiện trên màn hình này.
        </span>
      </Alert>
      {isError ? (
        <LoadError onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <Grid cols={{ base: 1, lg: 2 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}</Grid>
      ) : (
        <Grid cols={{ base: 1, lg: 2 }}>
          {data.map((it) => <IntegrationCard key={it.id} it={it} />)}
        </Grid>
      )}
    </Stack>
  );
}
