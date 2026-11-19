"use client";
// Sửa / xác nhận / hoàn tác một trường (sửa nhiều trường: updateMany) – cập nhật cache ngay để thao tác mượt, rồi đồng bộ số trường nghi ngờ của hồ sơ.
import { useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dossierKeys } from "@/api/dossiers";
import { confirmField, ocrKeys, revertField, updateFieldValue, updateFieldValues } from "@/api/ocr";
import { valueChargesKeys } from "@/api/value-charges";
import type { ExtractedField } from "@/mocks/types";
import { toastMutationError } from "@/lib/mutation-error";
import { FIELD_MUTATION_MESSAGES } from "./ocr.messages";

export function useFieldMutations(dossierId: string) {
  const qc = useQueryClient();
  const t = useMessages(FIELD_MUTATION_MESSAGES);
  const apply = (f: ExtractedField) => {
    qc.setQueryData<ExtractedField[]>(ocrKeys.fields(dossierId), (old) => old?.map((x) => (x.id === f.id ? f : x)));
    void qc.invalidateQueries({ queryKey: dossierKeys.all });
    // Điều kiện giao hàng / điều kiện cước đổi → cước phải khai và luật R-FREIGHT-TERM đổi theo.
    if (["incoterm", "freight_terms", "freight_term"].includes(f.key)) {
      void qc.invalidateQueries({ queryKey: valueChargesKeys.detail(dossierId) });
      void qc.invalidateQueries({ queryKey: ocrKeys.checks(dossierId) });
    }
  };
  return {
    update: useMutation({ mutationFn: ({ id, value }: { id: string; value: string }) => updateFieldValue(id, value), onSuccess: apply, onError: toastMutationError(t.saveFailed) }),
    confirm: useMutation({ mutationFn: (id: string) => confirmField(id), onSuccess: apply, onError: toastMutationError(t.confirmFailed) }),
    revert: useMutation({ mutationFn: (id: string) => revertField(id), onSuccess: apply, onError: toastMutationError(t.revertFailed) }),
    /** Sửa nhiều trường một lần (1 transaction ở máy chủ) – không gọi update song song: máy chủ ghi đè dữ liệu lô hàng lẫn nhau. */
    updateMany: useMutation({
      mutationFn: (edits: { id: string; value: string }[]) => updateFieldValues(dossierId, edits),
      onSuccess: (saved) => {
        const byId = new Map(saved.map((f) => [f.id, f]));
        qc.setQueryData<ExtractedField[]>(ocrKeys.fields(dossierId), (old) => old?.map((x) => byId.get(x.id) ?? x));
        void qc.invalidateQueries({ queryKey: dossierKeys.all });
        void qc.invalidateQueries({ queryKey: ocrKeys.checks(dossierId) });
      },
      onError: toastMutationError(t.saveFailed),
    }),
  };
}
