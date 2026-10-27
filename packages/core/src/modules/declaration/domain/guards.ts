// Điều kiện chuyển bước/duyệt/truyền (bất biến 7: không truyền khi còn BLOCKER FAIL hoặc HS chưa xác nhận). Thuần.
import { CATALOG_EDA, CATALOG_IDA, extraFieldIssue, requiredGapsText, type RequiredGap, isDeclarationFieldEditable, itemFieldIssue, parseItemFieldCode, type DeclarationFieldDef, type DeclarationStatus, type Role } from "@kb/contracts";
import { dec } from "../../../shared/decimal.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { lengthIssue } from "./field-length.js";
import { mappingsFor } from "./mapping/registry.js";
import type { StoredField } from "./types.js";

type ItemHs = { hsConfirmed: string | null; taxDetail?: { needsReview?: boolean } | null };
const unconfirmed = (items: ItemHs[]) => items.filter((i) => !i.hsConfirmed).length;
/** Dòng đã xác nhận nhưng thuế chưa khớp kết quả HSCodePro (mã nhập tay đang tra thuế, mã không còn trong gợi ý). */
const taxNeedsReview = (items: ItemHs[]) => items.filter((i) => i.hsConfirmed && i.taxDetail?.needsReview).length;

/** Chỉ tiêu bắt buộc có điều kiện còn trống mà Hải quan chắc chắn từ chối (vd MO/CU hàng chương 84/85 – CV 2061/TCHQ-GSQL). */
export const missingBlockingFields = (fields: Record<string, StoredField>) => Object.values(fields).filter((f) => f.blocking && f.value.trim() === "");

export function canMoveToReview(items: ItemHs[], hasDeclaration: boolean): Result<void> {
  const n = unconfirmed(items);
  if (n > 0) return err(reasonError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n }));
  if (!hasDeclaration) return err(reasonError("NO_DECLARATION", "DECLARATION_NOT_BUILT"));
  return ok(undefined);
}

/** Chỉ tiêu bắt buộc (theo ánh xạ VNACCS) đang trống – FPT sẽ từ chối, nên chặn ngay ở bước duyệt. */
export function missingRequiredFields(kind: "IDA" | "EDA", fields: Record<string, { value: string }>): { code: string; label: string }[] {
  // Chỉ tiêu theo tình huống (when) chỉ bắt buộc khi có trên tờ khai – không áp dụng cho lô này thì không có ô.
  return mappingsFor(kind).filter((m) => m.required && (!m.when || m.code in fields) && !fields[m.code]?.value?.trim()).map((m) => ({ code: m.code, label: m.label }));
}

export function canApprove(p: {
  role: Role; userId: string; ownerId: string; fourEyes: boolean; blockerFails: number; items: ItemHs[]; status: DeclarationStatus; exchangeRate?: string;
  missingFields?: { code: string; label: string }[]; fields?: Record<string, StoredField>;
  /** Ô bắt buộc còn trống trên tờ khai đầy đủ (@kb/contracts declarationRequiredGaps) – cùng quy tắc nút Phê duyệt ở giao diện. */
  requiredGaps?: RequiredGap[]; lineNos?: number[];
}): Result<void> {
  if (p.role !== "APPROVER" && p.role !== "OWNER") return err(reasonError("FORBIDDEN", "APPROVER_ROLE_REQUIRED"));
  if (p.status !== "DRAFT") return err(reasonError("INVALID_STATE", p.status === "NOT_CREATED" ? "DECLARATION_NOT_CREATED" : "DECLARATION_ALREADY_APPROVED"));
  if (p.blockerFails > 0) return err(reasonError("BLOCKER_FAILED", "BLOCKER_RULES_FAILED_FIX_IN_OCR", { n: p.blockerFails }));
  const n = unconfirmed(p.items);
  if (n > 0) return err(reasonError("HS_UNCONFIRMED", "HS_UNCONFIRMED", { n }));
  const review = taxNeedsReview(p.items);
  if (review > 0) return err(reasonError("INVALID_STATE", "TAX_NEEDS_REVIEW", { n: review }));
  if (p.exchangeRate !== undefined && dec(p.exchangeRate).isZero()) return err(reasonError("INVALID_STATE", "EXCHANGE_RATE_MISSING"));
  // Nguyên tắc 4 mắt (cấu hình org): người duyệt khác người tạo hồ sơ; Chủ sở hữu được miễn.
  if (p.fourEyes && p.role !== "OWNER" && p.userId === p.ownerId) return err(reasonError("FORBIDDEN", "FOUR_EYES"));
  // Sau kiểm quyền: người không được duyệt nhận FORBIDDEN, không phải danh sách chỉ tiêu.
  const blocking = p.fields ? missingBlockingFields(p.fields) : [];
  if (blocking.length) return err(reasonError("BLOCKER_FAILED", "BLOCKING_FIELDS_MISSING", { fields: blocking.map((f) => `${f.label}${f.no ? ` (${f.no})` : ""}${f.note ? ` – ${f.note}` : ""}`).join("; ") }));
  if (p.missingFields?.length) {
    const names = p.missingFields.map((f) => f.label);
    return err(reasonError("VALIDATION", "REQUIRED_FIELDS_MISSING_EDIT", { n: names.length, fields: names.join(", ") }, { missingFields: p.missingFields }));
  }
  if (p.requiredGaps?.length) {
    return err(reasonError("VALIDATION", "REQUIRED_FIELDS_MISSING_APPROVE", { n: p.requiredGaps.length, fields: requiredGapsText(p.requiredGaps, p.lineNos) }, { requiredGaps: p.requiredGaps }));
  }
  return ok(undefined);
}

export function canSubmit(p: { status: DeclarationStatus; blockerFails: number }): Result<void> {
  if (p.status === "SUBMITTED") return err(reasonError("ALREADY_SUBMITTED", "DECLARATION_SUBMITTED"));
  if (p.status !== "APPROVED") return err(reasonError("NOT_APPROVED", "DECLARATION_NOT_APPROVED"));
  if (p.blockerFails > 0) return err(reasonError("BLOCKER_FAILED", "BLOCKER_RULES_FAILED", { n: p.blockerFails }));
  return ok(undefined);
}

// Kiểu "int" không kiểm: ô số lượng kiện ghép số + mã đơn vị ("126 CT").
const FIELD_FORMATS: Partial<Record<DeclarationFieldDef["type"], { test: (v: string) => boolean; message: string }>> = {
  decimal: { test: (v) => /^\d+(\.\d+)?$/.test(v), message: "Giá trị phải là số (dấu chấm cho phần thập phân, không có dấu phân cách nghìn)" },
  date: { test: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), message: "Ngày phải theo dạng YYYY-MM-DD" },
};

/**
 * Người dùng sửa tay một chỉ tiêu: chặn chỉ tiêu là đầu vào tính thuế (hóa đơn, cước, tỷ giá), chỉ tiêu bắt buộc để trống,
 * giá trị sai kiểu số/ngày hoặc vượt độ dài theo catalog Phụ lục II (chỉ áp khi số chỉ tiêu ứng với đúng một ô – ô ghép như 1.44 bỏ qua),
 * và mã văn bản pháp quy ô 1 không phải MO/CU khi tờ khai có hàng chương 84/85 (`current.blocking`, CV 2061/TCHQ-GSQL).
 */
export function canEditField(kind: "IDA" | "EDA", code: string, value: string, current?: StoredField): Result<void> {
  if (!isDeclarationFieldEditable(code)) return err(domainError("VALIDATION", "Chỉ tiêu này không sửa tay trên tờ khai: số tờ khai do Hải quan cấp, loại hình đổi ở hồ sơ, trị giá/cước/tỷ giá sửa ở bước đọc chứng từ rồi dựng lại"));
  // Ô bổ sung (mã = tên trường VNACCS) / ô dòng hàng (HANG.<id>.<ô>): kiểu / độ dài theo đặc tả FPT.
  const item = parseItemFieldCode(code);
  const extraIssue = item ? itemFieldIssue(kind, item.key, value) : extraFieldIssue(kind, code, value);
  if (extraIssue) return err(domainError("VALIDATION", extraIssue));
  const mappings = mappingsFor(kind);
  const mapping = mappings.find((m) => m.code === code);
  if (value === "") return mapping?.required || current?.blocking ? err(domainError("VALIDATION", "Chỉ tiêu bắt buộc – không được để trống")) : ok(undefined);
  if (code === "VBPQ") {
    const codes = value.split(/[;,\s]+/).filter(Boolean);
    if (current?.blocking && !/^(MO|CU)$/.test(codes[0] ?? "")) return err(domainError("VALIDATION", "Hàng chương 84/85: ô 1 phải là MO (chưa qua sử dụng) hoặc CU (đã qua sử dụng) – CV 2061/TCHQ-GSQL"));
    if (codes.length > 5 || new Set(codes).size !== codes.length) return err(domainError("VALIDATION", "Tối đa 5 mã văn bản pháp quy, không trùng nhau (chỉ tiêu 1.37)"));
  }
  const tooLong = lengthIssue(kind, code, value);
  if (tooLong) return err(domainError("VALIDATION", tooLong));
  if (!mapping?.no || mappings.filter((m) => m.no === mapping.no).length !== 1) return ok(undefined);
  const def = (kind === "IDA" ? CATALOG_IDA : CATALOG_EDA).find((d) => d.no === mapping.no);
  const format = def ? FIELD_FORMATS[def.type] : undefined;
  return format && !format.test(value) ? err(domainError("VALIDATION", format.message)) : ok(undefined);
}
