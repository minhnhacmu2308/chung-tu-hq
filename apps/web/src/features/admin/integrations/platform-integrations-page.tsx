"use client";
import { UpdateIntegrationKeyInputSchema, type IntegrationId, type PlatformIntegration } from "@kb/contracts";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, Grid, IconTile, Input, PageHeader, SkeletonCard, Stack, StatusBadge, toast } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Building2, FileSpreadsheet, KeyRound, PlugZap, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { adminKeys, listPlatformIntegrations, testPlatformIntegration, updateIntegrationKey } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { INTEGRATION_STATUS } from "../common/admin-display";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";

const ICON: Record<IntegrationId, ReactNode> = {
  HSCODEPRO: <Search />,
  CUSTOMS_HUB: <Building2 />,
  AI_PROVIDER: <Bot />,
  EINVOICE: <FileSpreadsheet />,
};

function KeyDialog({ integration, onClose }: { integration: PlatformIntegration | null; onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  useEffect(() => {
    if (integration) setApiKey("");
  }, [integration]);
  const save = useAdminMutation({
    mutationFn: (reason: string) => updateIntegrationKey(integration!.id, { apiKey, reason }),
    success: (it) => `${it.name}: đã lưu khóa mới, kết nối tốt`,
    errorTitle: "Không lưu được khóa",
    onSuccess: onClose,
  });
  const check = UpdateIntegrationKeyInputSchema.shape.apiKey.safeParse(apiKey);
  return (
    <ReasonDialog
      open={integration !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Cập nhật khóa API"
      icon={<KeyRound className="h-4 w-4" />}
      description={integration?.name}
      confirmLabel="Lưu khóa"
      pending={save.isPending}
      canSubmit={check.success}
      onConfirm={(reason) => save.mutate(reason)}
    >
      <Alert tone="warning">Khóa mới thay khóa cũ ngay cho mọi doanh nghiệp. Sau khi lưu, màn hình chỉ còn hiện 4 ký tự cuối – không xem lại được khóa.</Alert>
      <Field label="Khóa API mới" required hint="Dán khóa do nhà cung cấp cấp." {...(apiKey !== "" && !check.success ? { error: check.error.issues[0]?.message } : {})}>
        <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="font-mono" />
      </Field>
    </ReasonDialog>
  );
}

function IntegrationCard({ it, onEditKey }: { it: PlatformIntegration; onEditKey: () => void }) {
  const qc = useQueryClient();
  const { can } = useAdminSession();
  const test = useMutation({
    mutationFn: () => testPlatformIntegration(it.id),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: adminKeys.all });
      toast(r.status === "CONNECTED" ? { tone: "success", title: `${r.name}: kết nối tốt` } : { tone: "danger", title: `${r.name}: lỗi`, description: r.detail ?? "" });
    },
    onError: toastMutationError(`Không kiểm tra được ${it.name}`),
  });
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTile icon={ICON[it.id]} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h3">{it.name}</CardTitle>
              <StatusBadge status={INTEGRATION_STATUS[it.status]} />
              <Badge tone="neutral" variant="outline" size="sm">{it.environment === "PRODUCTION" ? "Chính thức" : "Sandbox"}</Badge>
            </div>
            <CardDescription>{it.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <Stack gap="sm">
          {it.status === "ERROR" && it.detail ? <Alert tone="danger">{it.detail}</Alert> : it.detail ? <p className="text-sm text-fg-muted">{it.detail}</p> : null}
          <dl className="grid grid-cols-2 gap-3 rounded-md bg-surface-muted p-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-fg-subtle">Khóa API</dt>
              <dd className="text-fg">
                {it.keyLast4 ? (
                  <>
                    <span className="font-mono">•••• {it.keyLast4}</span>
                    {it.keyUpdatedAt && <span className="block text-xs text-fg-subtle">cập nhật {formatRelative(it.keyUpdatedAt)}</span>}
                  </>
                ) : (
                  "Chưa có khóa"
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-fg-subtle">Doanh nghiệp đang dùng</dt>
              <dd className="font-semibold tabular-nums text-fg">{formatNumber(it.orgCount)}</dd>
            </div>
          </dl>
        </Stack>
      </CardContent>
      <CardFooter className="flex-wrap justify-between">
        <span className="text-xs text-fg-subtle">{it.lastCheckedAt ? `Kiểm tra ${formatRelative(it.lastCheckedAt)}` : "Chưa kiểm tra"}</span>
        <div className="flex flex-wrap gap-2">
          {can("PLATFORM") && <Button size="sm" variant="secondary" leftIcon={<KeyRound className="h-4 w-4" />} onClick={onEditKey}>Cập nhật khóa</Button>}
          {can("SUPPORT") && (
            <Button size="sm" variant="secondary" leftIcon={<PlugZap className="h-4 w-4" />} loading={test.isPending} disabled={!it.keyLast4} onClick={() => test.mutate()}>
              Kiểm tra
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export function PlatformIntegrationsPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.integrations, queryFn: listPlatformIntegrations });
  const [editingId, setEditingId] = useState<IntegrationId | null>(null);
  const editing = data?.find((i) => i.id === editingId) ?? null;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Tích hợp dùng chung"
        description="Kết nối tới hệ thống bên ngoài bằng khóa của bên vận hành, dùng chung cho mọi doanh nghiệp. Một kết nối lỗi ở đây là lỗi của toàn hệ thống."
      />
      <Alert tone="info" title="Khóa nằm trong kho bí mật phía máy chủ">
        Màn này chỉ nhận khóa mới và hiện 4 ký tự cuối để nhận diện. Không ai – kể cả Quản trị cấp cao – xem lại được khóa đã lưu.
      </Alert>
      {isError ? (
        <LoadError onRetry={() => void refetch()} title="Không tải được danh sách tích hợp" />
      ) : isLoading || !data ? (
        <Grid cols={{ base: 1, lg: 2 }}>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={4} />)}</Grid>
      ) : (
        <Grid cols={{ base: 1, lg: 2 }} stagger>
          {data.map((it) => <IntegrationCard key={it.id} it={it} onEditKey={() => setEditingId(it.id)} />)}
        </Grid>
      )}
      <KeyDialog integration={editing} onClose={() => setEditingId(null)} />
    </Stack>
  );
}
