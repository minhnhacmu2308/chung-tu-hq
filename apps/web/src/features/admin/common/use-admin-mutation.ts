"use client";
import { toast } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toastMutationError } from "@/lib/mutation-error";

/**
 * Thao tác ghi của back-office: xong thì làm mới MỌI truy vấn (tổng quan, nhật ký và cả màn của khách đều suy ra từ
 * cùng dữ liệu), báo kết quả bằng toast; lỗi luôn hiện toast – không thao tác nào thất bại trong im lặng.
 */
export function useAdminMutation<TVars, TResult>(opts: {
  mutationFn: (vars: TVars) => Promise<TResult>;
  /** Tiêu đề toast khi thành công. */
  success: (result: TResult, vars: TVars) => string;
  /** Tiêu đề toast khi lỗi, vd "Không khóa được doanh nghiệp". */
  errorTitle: string;
  onSuccess?: (result: TResult) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: async (result, vars) => {
      await qc.invalidateQueries();
      toast({ tone: "success", title: opts.success(result, vars) });
      opts.onSuccess?.(result);
    },
    onError: toastMutationError(opts.errorTitle),
  });
}
