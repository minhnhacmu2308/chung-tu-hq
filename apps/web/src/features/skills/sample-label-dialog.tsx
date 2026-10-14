"use client";
// Sửa nhãn một mẫu: giá trị đúng của từng trường – dùng làm chuẩn khi "Đánh giá lại" skill.
import { Alert, Button, Dialog, DialogContent, DialogFooter, Field, Grid, Input, SkeletonForm, Stack, toast } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tags } from "lucide-react";
import { useState } from "react";
import { getSampleLabel, labelSample, skillKeys, type LabeledSample } from "@/api/skills";
import { LoadError } from "@/components/common/load-error";
import { toastMutationError } from "@/lib/mutation-error";
import type { Skill } from "@/mocks/types";
import { structuredCount, toExpected, toFormValues } from "./sample-label";

const sampleLabelKey = (skillId: string, sampleId: string) => [...skillKeys.samples(skillId), "label", sampleId] as const;

export function SampleLabelDialog({ skill, sample, onClose }: { skill: Skill; sample: LabeledSample; onClose: () => void }) {
  const qc = useQueryClient();
  const label = useQuery({ queryKey: sampleLabelKey(skill.id, sample.id), queryFn: () => getSampleLabel(skill.id, sample.id), gcTime: 0 });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const rows = label.data ? toFormValues(skill.fields, label.data.expected) : [];
  const structured = structuredCount(skill.fields);
  const reading = label.data !== undefined && label.data.expected === null;

  const save = useMutation({
    mutationFn: () => labelSample(skill.id, sample.id, toExpected(label.data?.expected ?? null, { ...Object.fromEntries(rows.map((r) => [r.field.key, r.value])), ...edits })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      toast({ tone: "success", title: "Đã lưu nhãn mẫu", description: "Bấm Đánh giá lại để đo độ chính xác theo nhãn mới." });
      onClose();
    },
    onError: toastMutationError("Không lưu được nhãn mẫu"),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={sample.status === "LABELED" ? "Sửa nhãn mẫu" : "Gắn nhãn mẫu"} icon={<Tags className="h-4 w-4" />} description={sample.fileName} size="md">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (label.data && !reading && !save.isPending) save.mutate();
          }}
        >
          {label.isError ? (
            <LoadError onRetry={() => void label.refetch()} />
          ) : label.isLoading || !label.data ? (
            <SkeletonForm />
          ) : reading ? (
            <Alert tone="info" title="AI đang đọc mẫu này">
              Chưa có kết quả đọc để kiểm tra. Đóng lại và mở sau ít phút.
            </Alert>
          ) : (
            <Stack gap="md">
              <p className="text-sm text-fg-muted">Nhập giá trị đúng như in trên chứng từ. Để trống nếu chứng từ không có trường đó.</p>
              <Grid cols={{ base: 1, md: 2 }} gap="sm">
                {rows.map(({ field, value }) => (
                  <Field key={field.key} label={field.label}>
                    <Input
                      type={field.type === "date" ? "date" : "text"}
                      inputMode={field.type === "decimal" ? "decimal" : undefined}
                      value={edits[field.key] ?? value}
                      onChange={(e) => {
                        const next = e.currentTarget.value; // đọc trước: trong hàm cập nhật của setState, currentTarget đã bị xóa
                        setEdits((prev) => ({ ...prev, [field.key]: next }));
                      }}
                    />
                  </Field>
                ))}
              </Grid>
              {structured > 0 && <p className="text-xs text-fg-subtle">{structured} trường có cấu trúc (bên mua/bán, bảng hàng) giữ theo kết quả đọc, chưa sửa được ở đây.</p>}
            </Stack>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!label.data || reading}>
              {sample.status === "LABELED" ? "Lưu nhãn" : "Xác nhận nhãn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
