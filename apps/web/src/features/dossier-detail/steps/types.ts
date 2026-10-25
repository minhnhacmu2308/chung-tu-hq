// Hợp đồng giữa khung chi tiết hồ sơ và màn từng bước.
import type { Dossier, StepId } from "@/mocks/types";

/** Bước xem được: 6 bước của hồ sơ + bước 7 "Sửa sau thông quan" (chỉ là khung nhìn, `dossier.step` vẫn là `submit`). */
export type ViewStep = StepId | "post";

export type StepProps = {
  dossier: Dossier;
  /** Chuyển sang bước khác (cập nhật URL ?step=, kèm ?branch= khi mở bước 7 cho một tờ khai nhánh). Bước tự gọi updateDossier nếu cần đổi bước đang dở của hồ sơ. */
  goTo: (step: ViewStep, opts?: { branch?: number; recalled?: string }) => void;
};
