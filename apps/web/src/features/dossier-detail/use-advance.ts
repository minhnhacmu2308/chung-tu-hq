"use client";
// Chuyển hồ sơ sang bước tiếp theo: lưu bước/trạng thái, cập nhật cache ngay (tránh nháy về bước cũ), rồi mở bước mới.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dossierKeys, updateDossier } from "@/api/dossiers";
import type { Dossier, StepId } from "@/mocks/types";
import { toastMutationError } from "@/lib/mutation-error";

type Patch = Parameters<typeof updateDossier>[1];

export function useAdvanceDossier(dossierId: string, goTo: (step: StepId) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ patch }: { patch: Patch; to: StepId }) => updateDossier(dossierId, patch),
    onSuccess: (d: Dossier, { to }) => {
      qc.setQueryData(dossierKeys.detail(d.id), d);
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      goTo(to);
    },
    onError: toastMutationError("Không chuyển được sang bước tiếp theo"),
  });
}
