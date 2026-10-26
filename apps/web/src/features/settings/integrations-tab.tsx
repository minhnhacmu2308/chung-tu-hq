"use client";
// Tab "Kết nối hệ thống" phía doanh nghiệp: chỉ những kết nối doanh nghiệp tự làm – hộp thư nhận chứng từ và tài khoản
// khai báo VNACCS (kèm nút thử đăng nhập FPT.VNACCS bằng tài khoản đó). Dịch vụ nền tảng (AI đọc chứng từ, hscodepro,
// hóa đơn điện tử, khóa Customs Hub) do quản trị KhaiBáo AI cấu hình ở khu Quản trị hệ thống, doanh nghiệp không thấy.
import { Alert, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, fill, IconTile, Stack, StatusBadge, toast, useMessages, type Status } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, KeyRound, PlugZap } from "lucide-react";
import { listIntegrations, settingsKeys, testIntegration } from "@/api/settings";
import { formatRelative } from "@/lib/format";
import type { Integration } from "@/mocks/types";
import { INTEGRATIONS_TAB_MESSAGES } from "./integrations-tab.messages";
import { MailboxSection } from "./mailbox-section";
import { VnaccsAccountSection } from "./vnaccs-account";

const STATUS = { CONNECTED: "INTEGRATION_CONNECTED", ERROR: "INTEGRATION_ERROR", NOT_CONFIGURED: "INTEGRATION_NOT_CONFIGURED" } as const satisfies Record<Integration["status"], Status>;

/** Thẻ VNACCS: tài khoản của doanh nghiệp + trạng thái lần thử đăng nhập FPT.VNACCS gần nhất. */
function VnaccsCard() {
  const qc = useQueryClient();
  const m = useMessages(INTEGRATIONS_TAB_MESSAGES);
  const { data } = useQuery({ queryKey: settingsKeys.integrations, queryFn: listIntegrations });
  const hub = data?.find((it) => it.id === "CUSTOMS_HUB");
  const test = useMutation({
    mutationFn: () => testIntegration("CUSTOMS_HUB"),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.integrations });
      toast(r.status === "CONNECTED" ? { tone: "success", title: m.testOk } : { tone: "danger", title: m.testFail, description: r.detail ?? "" });
    },
    onError: (e: Error) => toast({ tone: "warning", title: m.vnaccsTitle, description: e.message }),
  });
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTile icon={<Building2 />} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h3">{m.vnaccsTitle}</CardTitle>
              {hub && <StatusBadge status={STATUS[hub.status]} />}
            </div>
            <CardDescription>{m.vnaccsDesc}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <Stack gap="sm">
          {hub?.status === "ERROR" && hub.detail ? <Alert tone="danger">{hub.detail}</Alert> : hub?.detail ? <p className="text-sm text-fg-muted">{hub.detail}</p> : null}
          <VnaccsAccountSection />
        </Stack>
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-xs text-fg-subtle">{hub?.lastCheckedAt ? fill(m.checked, { when: formatRelative(hub.lastCheckedAt) }) : m.notChecked}</span>
        <Button size="sm" variant="secondary" leftIcon={<PlugZap className="h-4 w-4" />} loading={test.isPending} onClick={() => test.mutate()}>
          {m.test}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function IntegrationsTab() {
  const m = useMessages(INTEGRATIONS_TAB_MESSAGES);
  return (
    <Stack gap="md">
      <Alert tone="info" title={m.keysTitle}>
        <span className="inline-flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {m.keysBody}
        </span>
      </Alert>
      <MailboxSection />
      <VnaccsCard />
    </Stack>
  );
}
