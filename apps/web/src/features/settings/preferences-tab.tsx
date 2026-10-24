"use client";
import { Alert, AppearancePanel, Card, CardContent, CardDescription, CardHeader, CardTitle, Grid, SegmentedControl, Skeleton, SkeletonList, Stack, StatusBadge, Switch, fill, toast, useMessages } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession, sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys, updateFourEyes, updateSuspectThreshold } from "@/api/settings";
import { useAppearance } from "@/features/appearance/use-appearance";
import type { FieldStatus, Organization } from "@/mocks/types";
import { toastMutationError } from "@/lib/mutation-error";
import { LoadError } from "@/components/common/load-error";
import { InstallAppCard } from "@/features/pwa/install-app";
import { PREFERENCES_TAB_MESSAGES } from "./preferences-tab.messages";

type Threshold = Organization["suspectThreshold"];
const THRESHOLDS: Threshold[] = ["STRICT", "BALANCED", "RELAXED"];
/** Trạng thái nào bị đánh dấu "cần kiểm tra" theo từng ngưỡng (ADR 0003). */
const FLAGGED: Record<Threshold, FieldStatus[]> = {
  STRICT: ["CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE", "SINGLE_SOURCE"],
  BALANCED: ["CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE"],
  RELAXED: ["CONFLICT", "INVALID_FORMAT"],
};
export function PreferencesTab() {
  const qc = useQueryClient();
  const m = useMessages(PREFERENCES_TAB_MESSAGES);
  const thresholdOptions = THRESHOLDS.map((value) => ({ value, label: m[value] }));
  const { appearance, setAppearance, adjustments } = useAppearance();
  const { data: org, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  const save = useMutation({
    mutationFn: (t: Threshold) => updateSuspectThreshold(t),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.org });
      toast({ tone: "success", title: fill(m.thresholdSaved, { label: m[o.suspectThreshold] }), description: m.appliesNext });
    },
    onError: toastMutationError(m.thresholdError),
  });
  const current = save.isPending && save.variables ? save.variables : org?.suspectThreshold;
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const fourEyes = useMutation({
    mutationFn: (enabled: boolean) => updateFourEyes(enabled),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.org });
      toast({ tone: "success", title: o.fourEyes ? m.fourEyesOn : m.fourEyesOff, description: m.appliesNextApproval });
    },
    onError: toastMutationError(m.approvalError),
  });
  const fourEyesOn = fourEyes.isPending && fourEyes.variables !== undefined ? fourEyes.variables : (org?.fourEyes ?? false);

  return (
    <Grid cols={{ base: 1, xl: 2 }} className="items-start">
      <Stack gap="lg">
        <Card>
          <CardHeader>
            <CardTitle>{m.thresholdTitle}</CardTitle>
            <CardDescription>{m.thresholdDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {isError ? (
              <LoadError onRetry={() => void refetch()} />
            ) : isLoading || !current ? (
              <Skeleton className="h-40" />
            ) : (
              <Stack gap="md">
                <SegmentedControl label={m.threshold} value={current} options={thresholdOptions} onChange={(t) => save.mutate(t)} disabled={save.isPending} />
                <p className="text-sm text-fg-muted">{m[`explain${current}`]}</p>
                <Stack gap="xs">
                  <p className="text-xs font-medium text-fg-subtle">{m.flaggedWhen}</p>
                  <div className="flex flex-wrap gap-2">
                    {FLAGGED[current].map((s) => <StatusBadge key={s} status={s} />)}
                  </div>
                </Stack>
              </Stack>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{m.approvalTitle}</CardTitle>
            <CardDescription>{m.approvalDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {isError ? (
              <LoadError onRetry={() => void refetch()} />
            ) : isLoading || !org ? (
              <SkeletonList rows={1} />
            ) : (
              <Stack gap="sm">
                <Switch
                  label={m.fourEyes}
                  description={m.fourEyesDesc}
                  checked={fourEyesOn}
                  disabled={!canManage || fourEyes.isPending}
                  onCheckedChange={(v) => fourEyes.mutate(v)}
                />
                {!canManage && <p className="text-xs text-fg-subtle">{m.adminOnly}</p>}
              </Stack>
            )}
          </CardContent>
        </Card>
        <InstallAppCard />
      </Stack>
      <Card>
        <CardHeader>
          <CardTitle>{m.appearance}</CardTitle>
          <CardDescription>{m.appearanceDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="md">
            <Alert tone="info">
              {m.appearanceNoteBefore}<b>{m.appearanceNoteLock}</b>{m.appearanceNoteAfter}
            </Alert>
            <AppearancePanel value={appearance} onChange={setAppearance} allowCustomBrand brandAdjustments={adjustments} />
          </Stack>
        </CardContent>
      </Card>
    </Grid>
  );
}
