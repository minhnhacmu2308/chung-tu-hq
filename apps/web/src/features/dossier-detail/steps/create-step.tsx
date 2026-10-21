"use client";
// Bước 1 – xem lại thông tin đã khai khi tạo hồ sơ; ghi chú nội bộ sửa được.
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, Grid, Textarea, toast } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { dossierKeys, updateDossier } from "@/api/dossiers";
import { TRANSPORT_LABELS } from "@/features/dossiers/dossier-display";
import { TYPE_GROUPS, typeGroupOf } from "@/features/dossiers/create-dossier-options";
import { formatDate, formatDateTime } from "@/lib/format";
import type { StepProps } from "./types";
import { toastMutationError } from "@/lib/mutation-error";

export function CreateSummaryStep({ dossier, goTo }: StepProps) {
  const qc = useQueryClient();
  const [note, setNote] = useState(dossier.note ?? "");
  const save = useMutation({
    mutationFn: () => updateDossier(dossier.id, { note: note.trim() }),
    onSuccess: (d) => {
      qc.setQueryData(dossierKeys.detail(d.id), d);
      toast({ tone: "success", title: "Đã lưu ghi chú" });
    },
    onError: toastMutationError("Không lưu được ghi chú"),
  });

  const rows: [string, string][] = [
    ["Loại hồ sơ", dossier.direction === "NK" ? "Nhập khẩu" : "Xuất khẩu"],
    ["Nhóm loại hình", TYPE_GROUPS.find((g) => g.value === typeGroupOf(dossier.typeCode))?.label ?? ""],
    ["Mã loại hình", dossier.typeCode],
    ["Đối tác nước ngoài", dossier.partner],
    ["Cơ quan Hải quan", dossier.customsOffice],
    ...(dossier.incoterm ? [["Điều kiện giao hàng", dossier.incoterm] as [string, string]] : []),
    ["Phương thức vận chuyển", TRANSPORT_LABELS[dossier.transportMode]],
    ["Số vận đơn", dossier.billNo || "Chưa có – lấy từ B/L/AWB khi đọc chứng từ"],
    ["Bộ Skill AI", dossier.skillSetId === "default" ? "Mặc định của doanh nghiệp" : dossier.skillSetId],
    ["Hạn khai", formatDate(dossier.dueDate)],
    ["Ngày tạo", formatDateTime(dossier.createdAt)],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin hồ sơ</CardTitle>
        <CardDescription>Khai khi tạo hồ sơ. Thông tin lô hàng chi tiết được lấy từ chứng từ ở các bước sau.</CardDescription>
      </CardHeader>
      <CardContent>
        <Grid cols={{ base: 1, md: 2 }}>
          <dl className="grid gap-x-6 gap-y-3 cq-sm:grid-cols-2 cq-md:col-span-2 cq-xl:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-fg-subtle">{k}</dt>
                <dd className="break-words text-sm text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <Field label="Ghi chú nội bộ" hint="Chỉ người trong doanh nghiệp thấy" className="cq-md:col-span-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ví dụ: số PO, cảng hàng về, người liên hệ" />
          </Field>
        </Grid>
      </CardContent>
      <CardFooter>
        <Button variant="secondary" loading={save.isPending} disabled={note.trim() === (dossier.note ?? "")} onClick={() => save.mutate()}>
          Lưu ghi chú
        </Button>
        <Button rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => goTo("upload")}>
          Upload chứng từ
        </Button>
      </CardFooter>
    </Card>
  );
}
