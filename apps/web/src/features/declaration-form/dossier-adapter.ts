// Tờ khai của hồ sơ (chỉ tiêu theo mã app: MA_LH, PTVC, CANG_DO…) ↔ form tờ khai đầy đủ (ô theo tên trường VNACCS: TK_ICB, TK_MTC, VD_DST…).
// Bảng chuyển mã và quy tắc ô nào sửa được theo giai đoạn ở @kb/contracts (app-fields) – backend dùng cùng quy tắc khi lưu.
import { DERIVED_LOCK, declarationFormValues, editableFormKeys, formKeyLock, isItemFieldKey, itemFieldClass, itemFieldCode, itemFormValues, itemInputKeys, mappedAppCodes, pendingFormEdits, type AmendLock, type DeclarationEditMode, type DeclarationField, type LineItem } from "@kb/contracts";
import type { FormValues } from "./form-state";

type Kind = "IDA" | "EDA";

/** Giá trị ô form từ các chỉ tiêu của tờ khai hồ sơ. */
export const declarationValues = (kind: Kind, fields: Pick<DeclarationField, "code" | "value">[]): FormValues => declarationFormValues(kind, fields);

/** Dòng hàng → ô HAG_* (số liệu chứng từ, HS, giá trị tự điền khi truyền, ô người khai nhập) – quy tắc chung ở @kb/contracts. */
export const itemValues = itemFormValues;

/** Ô dòng hàng cần lưu: ô người khai nhập (INPUT) mà giá trị khác bản gốc → chỉ tiêu HANG.<id dòng>.<ô>. */
export function pendingItemEdits(kind: Kind, ids: string[], original: FormValues[], draft: FormValues[]): { code: string; value: string }[] {
  const keys = itemInputKeys(kind);
  return ids.flatMap((id, i) =>
    keys.filter((k) => (draft[i]?.[k] ?? "").trim() !== (original[i]?.[k] ?? "").trim()).map((k) => ({ code: itemFieldCode(id, k), value: (draft[i]?.[k] ?? "").trim() })),
  );
}

/** Ô form sửa được → mã chỉ tiêu lưu, theo chế độ sửa (FULL: chưa khai báo · AMEND: sửa đổi bổ sung, khóa theo Phụ lục II · LOCKED). */
export const editableKeys = (kind: Kind, fields: Pick<DeclarationField, "code" | "value">[], mode: DeclarationEditMode): Map<string, string> =>
  editableFormKeys(kind, mode, declarationFormValues(kind, fields));

/** Các chỉ tiêu cần lưu: chỉ tiêu có ô sửa được mà giá trị ghép lại khác bản gốc. */
export const pendingEdits = (kind: Kind, original: FormValues, draft: FormValues, editable: Map<string, string>) => pendingFormEdits(kind, original, draft, editable);

/** Mã chỉ tiêu app có ô trên form đầy đủ. */
export const mappedCodes = (kind: Kind): string[] => mappedAppCodes(kind);

/** Lý do ô dòng hàng không sửa trên tờ khai (ô người khai nhập → null). */
export const ITEM_LOCK: Record<"DOC" | "HS" | "DERIVED", AmendLock> = {
  DOC: { basis: "SOFTWARE", reason: "Số liệu chứng từ – sửa ở bước OCR" },
  HS: { basis: "SOFTWARE", reason: "Theo mã HS – nút Chọn mã HS" },
  DERIVED: { basis: "SOFTWARE", reason: "Theo nguyên tệ hóa đơn" },
};

/** Ô nào khóa và vì sao (null = sửa được) – dùng chung cho form đầy đủ và bản in. */
export function declarationLockOf(kind: Kind, mode: DeclarationEditMode, original: FormValues, editable: Map<string, string>): (key: string) => AmendLock | null {
  return (key) => {
    if (isItemFieldKey(kind, key)) {
      const c = itemFieldClass(kind, key);
      return c === "INPUT" ? formKeyLock(kind, key, mode, original) : ITEM_LOCK[c];
    }
    return editable.has(key) ? null : formKeyLock(kind, key, mode, original) ?? DERIVED_LOCK;
  };
}
