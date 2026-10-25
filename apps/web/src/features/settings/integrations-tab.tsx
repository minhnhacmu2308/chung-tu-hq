"use client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Grid, IconTile, Skeleton, Stack, fill, toast, useMessages, StatusBadge, type Status } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Building2, FileSpreadsheet, KeyRound, PlugZap, Search } from "lucide-react";
import type { ReactNode } from "react";
import { listIntegrations, settingsKeys, testIntegration } from "@/api/settings";
import { formatRelative } from "@/lib/format";
import type { Integration } from "@/mocks/types";
import { LoadError } from "@/components/common/load-error";
import { INTEGRATIONS_TAB_MESSAGES } from "./integrations-tab.messages";
import { MailboxSection } from "./mailbox-section";
import { VnaccsAccountSection } from "./vnaccs-account";

const STATUS = { CONNECTED: "INTEGRATION_CONNECTED", ERROR: "INTEGRATION_ERROR", NOT_CONFIGURED: "INTEGRATION_NOT_CONFIGURED" } as const satisfies Record<Integration["status"], Status>;
const ICON: Record<Integration["id"], ReactNode> = {
  HSCODEPRO: <Search />,
  CUSTOMS_HUB: <Building2 />,
  AI_PROVIDER: <Bot />,
  EINVOICE: <FileSpreadsheet />,
};

function IntegrationCard({ it }: { it: Integration }) {
  const qc = useQueryClient();
  const m = useMessages(INTEGRATIONS_TAB_MESSAGES);
  const test = useMutation({
    mutationFn: () => testIntegration(it.id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.integrations });
      toast(r.status === "CONNECTED" ? { tone: "success", title: fill(m.testOk, { name: r.name }) } : { tone: "danger", title: fill(m.testFail, { name: r.name }), description: r.detail ?? "" });
    },
    onError: (e: Error) => toast({ tone: "warning", title: it.name, description: e.message }),
  });
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTile icon={ICON[it.id]} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h3">{it.name}</CardTitle>
              <StatusBadge status={STATUS[it.status]} />
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
            <p className="text-sm text-fg-subtle">{m.notEnabled}</p>
          )}
          {it.id === "CUSTOMS_HUB" && <VnaccsAccountSection />}
        </Stack>
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-xs text-fg-subtle">{it.lastCheckedAt ? fill(m.checked, { when: formatRelative(it.lastCheckedAt) }) : m.notChecked}</span>
        <Button size="sm" variant="secondary" leftIcon={<PlugZap className="h-4 w-4" />} loading={test.isPending} onClick={() => test.mutate()}>
          {m.test}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function IntegrationsTab() {
  const m = useMessages(INTEGRATIONS_TAB_MESSAGES);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.integrations, queryFn: listIntegrations });
  return (
    <Stack gap="md">
      <Alert tone="info" title={m.keysTitle}>
        <span className="inline-flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {m.keysBody}
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
      <MailboxSection />
    </Stack>
  );
}
