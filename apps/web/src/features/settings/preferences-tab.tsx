"use client";
import { Alert, AppearancePanel, Card, CardContent, CardDescription, CardHeader, CardTitle, Grid, SegmentedControl, Skeleton, SkeletonList, Stack, StatusBadge, Switch, toast } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession, sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys, updateFourEyes, updateSuspectThreshold } from "@/api/settings";
import { useAppearance } from "@/features/appearance/use-appearance";
import type { FieldStatus, Organization } from "@/mocks/types";
import { toastMutationError } from "@/lib/mutation-error";
import { LoadError } from "@/components/common/load-error";

type Threshold = Organization["suspectThreshold"];
const THRESHOLDS: { value: Threshold; label: string }[] = [
  { value: "STRICT", label: "Chặt" },
  { value: "BALANCED", label: "Cân bằng" },
  { value: "RELAXED", label: "Thoáng" },
];
/** Trạng thái nào bị đánh dấu "cần kiểm tra" theo từng ngưỡng (ADR 0003). */
const FLAGGED: Record<Threshold, FieldStatus[]> = {
  STRICT: ["CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE", "SINGLE_SOURCE"],
  BALANCED: ["CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE"],
  RELAXED: ["CONFLICT", "INVALID_FORMAT"],
};
const EXPLAIN: Record<Threshold, string> = {
  STRICT: "Trường chỉ có ở một chứng từ (không đối chiếu được) cũng phải xem lại. Nhiều trường cần kiểm tra hơn, an toàn nhất cho lô mới hoặc nhà cung cấp mới.",
  BALANCED: "Đánh dấu khi chứng từ mâu thuẫn, sai định dạng hoặc AI không chắc. Phù hợp đa số doanh nghiệp.",
  RELAXED: "Chỉ đánh dấu khi chứng từ mâu thuẫn hoặc sai định dạng. Dùng cho nhà cung cấp quen, skill đã đạt độ chính xác cao.",
};

export function PreferencesTab() {
  const qc = useQueryClient();
  const { appearance, setAppearance, adjustments } = useAppearance();
  const { data: org, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  const save = useMutation({
    mutationFn: (t: Threshold) => updateSuspectThreshold(t),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.org });
      toast({ tone: "success", title: `Ngưỡng: ${THRESHOLDS.find((t) => t.value === o.suspectThreshold)?.label}`, description: "Áp dụng cho các lần đọc tiếp theo." });
    },
    onError: toastMutationError("Không lưu được ngưỡng"),
  });
  const current = save.isPending && save.variables ? save.variables : org?.suspectThreshold;
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const fourEyes = useMutation({
    mutationFn: (enabled: boolean) => updateFourEyes(enabled),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.org });
      toast({ tone: "success", title: o.fourEyes ? "Đã bật nguyên tắc 4 mắt" : "Đã tắt nguyên tắc 4 mắt", description: "Áp dụng cho các lần phê duyệt tiếp theo." });
    },
    onError: toastMutationError("Không lưu được cài đặt phê duyệt"),
  });
  const fourEyesOn = fourEyes.isPending && fourEyes.variables !== undefined ? fourEyes.variables : (org?.fourEyes ?? false);

  return (
    <Grid cols={{ base: 1, xl: 2 }} className="items-start">
      <Stack gap="lg">
        <Card>
          <CardHeader>
            <CardTitle>Ngưỡng hiển thị trường nghi ngờ</CardTitle>
            <CardDescription>Quyết định trường nào phải được người xem lại trước khi xác nhận dữ liệu. Không ảnh hưởng tới các luật đối chiếu BLOCKER.</CardDescription>
          </CardHeader>
          <CardContent>
            {isError ? (
              <LoadError onRetry={() => void refetch()} />
            ) : isLoading || !current ? (
              <Skeleton className="h-40" />
            ) : (
              <Stack gap="md">
                <SegmentedControl label="Ngưỡng" value={current} options={THRESHOLDS} onChange={(t) => save.mutate(t)} disabled={save.isPending} />
                <p className="text-sm text-fg-muted">{EXPLAIN[current]}</p>
                <Stack gap="xs">
                  <p className="text-xs font-medium text-fg-subtle">Trường bị đánh dấu khi có trạng thái:</p>
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
            <CardTitle>Kiểm soát phê duyệt</CardTitle>
            <CardDescription>Ai được phê duyệt tờ khai trước khi truyền Hải quan.</CardDescription>
          </CardHeader>
          <CardContent>
            {isError ? (
              <LoadError onRetry={() => void refetch()} />
            ) : isLoading || !org ? (
              <SkeletonList rows={1} />
            ) : (
              <Stack gap="sm">
                <Switch
                  label="Nguyên tắc 4 mắt"
                  description="Người phê duyệt tờ khai phải khác người tạo hồ sơ. Chủ sở hữu vẫn duyệt được hồ sơ của chính mình."
                  checked={fourEyesOn}
                  disabled={!canManage || fourEyes.isPending}
                  onCheckedChange={(v) => fourEyes.mutate(v)}
                />
                {!canManage && <p className="text-xs text-fg-subtle">Chỉ Quản trị hoặc Chủ sở hữu đổi được cài đặt này.</p>}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
      <Card>
        <CardHeader>
          <CardTitle>Giao diện</CardTitle>
          <CardDescription>Màu thương hiệu, phông chữ, bo góc, mật độ hiển thị. Thay đổi áp dụng ngay.</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="md">
            <Alert tone="info">
              Bản thật: Quản trị đặt mặc định cho cả doanh nghiệp và có thể <b>khóa</b> màu thương hiệu, phông chữ, bo góc… để mọi người dùng giống nhau. Bản mô phỏng đang lưu theo trình duyệt này.
            </Alert>
            <AppearancePanel value={appearance} onChange={setAppearance} allowCustomBrand brandAdjustments={adjustments} />
          </Stack>
        </CardContent>
      </Card>
    </Grid>
  );
}
