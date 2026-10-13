"use client";
// Sửa / xác nhận / hoàn tác một trường – cập nhật cache ngay để thao tác mượt, rồi đồng bộ số trường nghi ngờ của hồ sơ.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dossierKeys } from "@/api/dossiers";
import { confirmField, ocrKeys, revertField, updateFieldValue } from "@/api/ocr";
import type { ExtractedField } from "@/mocks/types";
import { toastMutationError } from "@/lib/mutation-error";

export function useFieldMutations(dossierId: string) {
  const qc = useQueryClient();
  const apply = (f: ExtractedField) => {
    qc.setQueryData<ExtractedField[]>(ocrKeys.fields(dossierId), (old) => old?.map((x) => (x.id === f.id ? f : x)));
    void qc.invalidateQueries({ queryKey: dossierKeys.all });
  };
  return {
    update: useMutation({ mutationFn: ({ id, value }: { id: string; value: string }) => updateFieldValue(id, value), onSuccess: apply, onError: toastMutationError("Không lưu được giá trị") }),
    confirm: useMutation({ mutationFn: (id: string) => confirmField(id), onSuccess: apply, onError: toastMutationError("Không xác nhận được trường") }),
    revert: useMutation({ mutationFn: (id: string) => revertField(id), onSuccess: apply, onError: toastMutationError("Không hoàn tác được") }),
  };
}
