"use client";
// Lưu các chỉ tiêu đã sửa của tờ khai – dùng chung cho form đầy đủ và bản in.
import { toast } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { declarationKeys, updateDeclarationField } from "@/api/declaration";
import { dossierKeys } from "@/api/dossiers";
import { formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";

export function useSaveDeclarationEdits(dossierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (list: { code: string; value: string }[]) => {
      // Lưu lần lượt: mỗi chỉ tiêu một lần gọi (backend kiểm tra và ghi nhật ký sửa từng chỉ tiêu).
      for (const e of list) await updateDeclarationField(dossierId, e.code, e.value);
    },
    onSuccess: (_d, list) => toast({ tone: "success", title: `Đã lưu ${formatNumber(list.length)} chỉ tiêu` }),
    onError: toastMutationError("Không lưu được tờ khai"),
    // Lưu dở (lỗi giữa chừng) vẫn tải lại để màn hình đúng với dữ liệu đã lưu.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
    },
  });
}
