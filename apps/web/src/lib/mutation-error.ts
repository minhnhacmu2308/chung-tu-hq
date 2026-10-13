import { toast } from "@kb/ui";

/** onError chung cho thao tác lưu: báo lỗi bằng toast để không có thao tác nào thất bại trong im lặng. */
export const toastMutationError = (title: string) => (error: unknown) =>
  toast({ tone: "danger", title, description: error instanceof Error ? error.message : "Có lỗi xảy ra, thử lại sau." });
