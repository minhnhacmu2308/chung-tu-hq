// Tờ khai của hồ sơ (chỉ tiêu theo mã app: MA_LH, PTVC, CANG_DO…) ↔ form tờ khai đầy đủ (ô theo tên trường VNACCS: TK_ICB, TK_MTC, VD_DST…).
// Bảng chuyển mã và quy tắc ô nào sửa được theo giai đoạn ở @kb/contracts (app-fields) – backend dùng cùng quy tắc khi lưu.
import { declarationFormValues, editableFormKeys, itemDefaults, itemFieldCode, itemInputKeys, itemOverrides, mappedAppCodes, pendingFormEdits, type DeclarationEditMode, type DeclarationField, type LineItem } from "@kb/contracts";
import type { FormValues } from "./form-state";

type Kind = "IDA" | "EDA";

/** Giá trị ô form từ các chỉ tiêu của tờ khai hồ sơ. */
export const declarationValues = (kind: Kind, fields: Pick<DeclarationField, "code" | "value">[]): FormValues => declarationFormValues(kind, fields);

type ItemInput = Partial<Pick<LineItem, "lineNo">> & Pick<LineItem, "description" | "quantity" | "unit" | "unitPrice" | "amount" | "origin" | "hsSuggested" | "hsConfirmed" | "importDutyRate" | "vatRate" | "policyNote"> & { id?: string };

/**
 * Dòng hàng → ô HAG_*: số liệu chứng từ (sửa ở OCR) + mã HS, thuế suất (luồng HS) + giá trị phần mềm tự điền khi truyền + ô người khai đã nhập trên tờ khai
 * (`fields`: chỉ tiêu HANG.<id dòng>.<ô>) – màn hình hiện đúng giá trị sẽ gửi FPT. `currency`, `vbpq` (EDA 2.80) cho giá trị tự điền.
 */
export function itemValues(kind: Kind, items: ItemInput[], ctx: { fields?: Pick<DeclarationField, "code" | "value">[]; currency?: string; vbpq?: string } = {}): FormValues[] {
  const lineNos = items.map((it, i) => it.lineNo ?? i + 1);
  return items.map((it, i) => {
    const v: FormValues = {
      ...(ctx.currency ? itemDefaults(kind, { ...it, lineNo: lineNos[i]! }, { currency: ctx.currency, lineNos, ...(ctx.vbpq ? { vbpq: ctx.vbpq } : {}) }) : {}),
      HAG_CMD: it.hsConfirmed ?? it.hsSuggested ?? "", HAG_CMN: it.description, HAG_QN1: it.quantity, HAG_QT1: it.unit,
      HAG_UPR: it.unitPrice, HAG_BPR: it.amount,
    };
    // Mẫu 02 không có ô xuất xứ riêng (ghi trong mô tả "#&mã nước", app giữ ô Xuất xứ), ô thuế suất là thuế xuất khẩu – chỉ điền cho tờ khai nhập.
    if (kind === "IDA") {
      v["HAG_OR"] = it.origin;
      if (it.importDutyRate !== undefined) v["HAG_TXA"] = it.importDutyRate;
    } else if (it.origin) v["APP_XUAT_XU"] = it.origin;
    return it.id && ctx.fields ? { ...v, ...itemOverrides(ctx.fields, it.id) } : v;
  });
}

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
