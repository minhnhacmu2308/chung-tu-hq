// Hợp đồng giữa khung chi tiết hồ sơ và màn từng bước.
import type { Dossier, StepId } from "@/mocks/types";

export type StepProps = {
  dossier: Dossier;
  /** Chuyển sang bước khác (cập nhật URL ?step=). Bước tự gọi updateDossier nếu cần đổi bước đang dở của hồ sơ. */
  goTo: (step: StepId) => void;
};
