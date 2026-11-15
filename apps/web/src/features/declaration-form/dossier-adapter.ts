// Tờ khai của hồ sơ (chỉ tiêu theo mã app: MA_LH, PTVC, CANG_DO…) ↔ form tờ khai đầy đủ (ô theo tên trường VNACCS: TK_ICB, TK_MTC, VD_DST…).
// Bảng chuyển mã và quy tắc ô nào sửa được theo giai đoạn ở @kb/contracts (app-fields) – backend dùng cùng quy tắc khi lưu.
import { AUTO_COMPUTED_KEYS, DERIVED_LOCK, declarationFormValues, editableFormKeys, formKeyLock, isItemFieldKey, itemFieldClass, itemFieldCode, itemFormValues, itemAutoChecks, itemInputKeys, mappedAppCodes, normalizationEdits, otherTaxGroupOf, pendingFormEdits, type AmendLock, type DeclarationEditMode, type DeclarationField, type LineItem } from "@kb/contracts";
import { UI_LOCALES, pickMessages, type UiLocale } from "@kb/ui";
import { FORM_MESSAGES } from "./form.messages";
import type { FormValues } from "./form-state";

type Kind = "IDA" | "EDA";

/** Giá trị ô form từ các chỉ tiêu của tờ khai hồ sơ. */
export const declarationValues = (kind: Kind, fields: Pick<DeclarationField, "code" | "value">[]): FormValues => declarationFormValues(kind, fields);

/** Dòng hàng → ô HAG_* (số liệu chứng từ, HS, giá trị tự điền khi truyền, ô người khai nhập) – quy tắc chung ở @kb/contracts. */
export const itemValues = itemFormValues;

/**
 * Dòng hàng → đầu vào itemAutoChecks: thuế suất đang chờ tra lại (`taxNeedsReview`) thì coi mã GTGT là chưa chắc (vatCertain = false) –
 * cùng quy tắc backend (declaration.ts requiredGaps: needsReview → vatCertain false).
 */
export const autoCheckInput = (it: LineItem): LineItem => (it.taxNeedsReview === true ? { ...it, vatCertain: false } : it);

/**
 * Cảnh báo ô GTGT tự điền của một dòng (form đầy đủ và panel bản in dùng chung).
 * Hết cảnh báo khi: người khai đã lưu mã GTGT (`own`), ô GTGT đang có mã khác mã tự điền, hoặc đã bấm "Xác nhận" (`confirmed`) với ô đang có mã.
 * Ô GTGT trống không bao giờ tính là đã xác nhận. `confirmKeys`: ô ghi nhận khi bấm "Xác nhận" (HAG_TX5, thêm HAG_TR5 nếu có) – rỗng khi ô GTGT trống.
 */
export function gtgtAutoCheck(kind: Kind, item: LineItem, own: FormValues, auto: FormValues, current: FormValues, confirmed: readonly string[]): { checks: { key: string; reason: string }[]; confirmKeys: string[] } {
  if (kind !== "IDA") return { checks: [], confirmKeys: [] };
  const tx = (current["HAG_TX5"] ?? "").trim();
  const tr = (current["HAG_TR5"] ?? "").trim();
  const confirmKeys = tx ? ["HAG_TX5", ...(tr ? ["HAG_TR5"] : [])] : [];
  const ownVat = Object.entries(own).some(([k, v]) => /^HAG_TX[1-5]$/.test(k) && otherTaxGroupOf(v) === 5);
  const edited = tx !== "" && tx !== (auto["HAG_TX5"] ?? "").trim();
  if (ownVat || edited || (tx !== "" && confirmed.length > 0)) return { checks: [], confirmKeys };
  return { checks: itemAutoChecks(kind, autoCheckInput(item)), confirmKeys };
}

const OTHER_TAX_KEY = /^HAG_T[XRG][1-5]$/;

/**
 * Ô dòng hàng cần lưu: ô người khai nhập (INPUT) mà giá trị khác bản gốc → chỉ tiêu HANG.<id dòng>.<ô>.
 * `own` (ô người khai đã lưu của từng dòng, itemOverrides): dòng IDA có sửa ô thuế khác thì kèm normalizationEdits(own) – ghi lại mã cũ ở khóa lệch
 * về đúng dòng loại thuế (mỗi lệnh là một sửa ô → field_audit như thường), để mã cũ không thành "trùng loại" với mã người khai vừa nhập. Giá trị người khai thắng.
 */
export function pendingItemEdits(kind: Kind, ids: string[], original: FormValues[], draft: FormValues[], own?: FormValues[], confirmed?: string[][]): { code: string; value: string }[] {
  const keys = itemInputKeys(kind);
  return ids.flatMap((id, i) => {
    const changed = keys.filter((k) => (draft[i]?.[k] ?? "").trim() !== (original[i]?.[k] ?? "").trim()).map((k) => ({ key: k, value: (draft[i]?.[k] ?? "").trim() }));
    // Ô người khai chủ động chọn/xác nhận (kể cả bằng giá trị tự điền) → lưu như giá trị người khai: ghi field_audit và hết cảnh báo "tự điền".
    for (const k of confirmed?.[i] ?? []) {
      const v = (draft[i]?.[k] ?? "").trim();
      if (v && keys.includes(k) && !changed.some((e) => e.key === k)) changed.push({ key: k, value: v });
    }
    const normalize = kind === "IDA" && own?.[i] && changed.some((e) => OTHER_TAX_KEY.test(e.key)) ? normalizationEdits(own[i]!).filter((n) => !changed.some((e) => e.key === n.key)) : [];
    return [...normalize, ...changed].map((e) => ({ code: itemFieldCode(id, e.key), value: e.value }));
  });
}

/** Ô form sửa được → mã chỉ tiêu lưu, theo chế độ sửa (FULL: chưa khai báo · AMEND: sửa đổi bổ sung, khóa theo Phụ lục II · LOCKED). */
export const editableKeys = (kind: Kind, fields: Pick<DeclarationField, "code" | "value">[], mode: DeclarationEditMode): Map<string, string> =>
  editableFormKeys(kind, mode, declarationFormValues(kind, fields));

/** Các chỉ tiêu cần lưu: chỉ tiêu có ô sửa được mà giá trị ghép lại khác bản gốc. */
export const pendingEdits = (kind: Kind, original: FormValues, draft: FormValues, editable: Map<string, string>) => pendingFormEdits(kind, original, draft, editable);

/** Mã chỉ tiêu app có ô trên form đầy đủ. */
export const mappedCodes = (kind: Kind): string[] => mappedAppCodes(kind);

/** Lý do ô dòng hàng không sửa trên tờ khai (ô người khai nhập → null), theo ngôn ngữ giao diện. */
export const ITEM_LOCK: Record<UiLocale, Record<"DOC" | "HS" | "DERIVED", AmendLock>> = Object.fromEntries(
  UI_LOCALES.map((l) => {
    const t = pickMessages(FORM_MESSAGES, l);
    return [l, { DOC: { basis: "SOFTWARE", reason: t.lockDoc }, HS: { basis: "SOFTWARE", reason: t.lockHs }, DERIVED: { basis: "SOFTWARE", reason: t.lockDerived } }];
  }),
) as Record<UiLocale, Record<"DOC" | "HS" | "DERIVED", AmendLock>>;

/** Ô nào khóa và vì sao (null = sửa được) – dùng chung cho form đầy đủ và bản in. */
export function declarationLockOf(kind: Kind, mode: DeclarationEditMode, original: FormValues, editable: Map<string, string>, locale: UiLocale): (key: string) => AmendLock | null {
  return (key) => {
    if (isItemFieldKey(kind, key)) {
      const c = itemFieldClass(kind, key);
      return c === "INPUT" ? formKeyLock(kind, key, mode, original) : ITEM_LOCK[locale][c];
    }
    if (AUTO_COMPUTED_KEYS.has(key)) return { basis: "SOFTWARE", reason: pickMessages(FORM_MESSAGES, locale).lockAutoSheet };
    return editable.has(key) ? null : formKeyLock(kind, key, mode, original) ?? DERIVED_LOCK;
  };
}
