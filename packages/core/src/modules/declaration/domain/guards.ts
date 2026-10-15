// Điều kiện chuyển bước/duyệt/truyền (bất biến 7: không truyền khi còn BLOCKER FAIL hoặc HS chưa xác nhận). Thuần.
import { CATALOG_EDA, CATALOG_IDA, isDeclarationFieldEditable, type DeclarationFieldDef, type DeclarationStatus, type Role } from "@kb/contracts";
import { dec } from "../../../shared/decimal.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { lengthIssue, mappingsFor } from "./build.js";
import type { StoredField } from "./types.js";

type ItemHs = { hsConfirmed: string | null };
const unconfirmed = (items: ItemHs[]) => items.filter((i) => !i.hsConfirmed).length;

/** Chỉ tiêu bắt buộc có điều kiện còn trống mà Hải quan chắc chắn từ chối (vd MO/CU hàng chương 84/85 – CV 2061/TCHQ-GSQL). */
export const missingBlockingFields = (fields: Record<string, StoredField>) => Object.values(fields).filter((f) => f.blocking && f.value.trim() === "");

export function canMoveToReview(items: ItemHs[], hasDeclaration: boolean): Result<void> {
  const n = unconfirmed(items);
  if (n > 0) return err(domainError("HS_UNCONFIRMED", `Còn ${n} mã HS chưa xác nhận`));
  if (!hasDeclaration) return err(domainError("NO_DECLARATION", "Chưa dựng tờ khai – chạy agent với lựa chọn có “Tạo tờ khai”"));
  return ok(undefined);
}

export function canApprove(p: { role: Role; userId: string; ownerId: string; fourEyes: boolean; blockerFails: number; items: ItemHs[]; status: DeclarationStatus; exchangeRate?: string; fields?: Record<string, StoredField> }): Result<void> {
  if (p.role !== "APPROVER" && p.role !== "OWNER") return err(domainError("FORBIDDEN", "Chỉ Người duyệt hoặc Chủ sở hữu được phê duyệt tờ khai"));
  if (p.status !== "DRAFT") return err(domainError("INVALID_STATE", p.status === "NOT_CREATED" ? "Chưa có tờ khai" : "Tờ khai đã được duyệt"));
  if (p.blockerFails > 0) return err(domainError("BLOCKER_FAILED", `Còn ${p.blockerFails} luật lỗi chặn truyền – xử lý ở bước OCR & kiểm tra`));
  const blocking = p.fields ? missingBlockingFields(p.fields) : [];
  if (blocking.length) return err(domainError("BLOCKER_FAILED", `Chưa khai chỉ tiêu bắt buộc: ${blocking.map((f) => `${f.label}${f.no ? ` (${f.no})` : ""}${f.note ? ` – ${f.note}` : ""}`).join("; ")}`));
  const n = unconfirmed(p.items);
  if (n > 0) return err(domainError("HS_UNCONFIRMED", `Còn ${n} mã HS chưa xác nhận`));
  if (p.exchangeRate !== undefined && dec(p.exchangeRate).isZero()) return err(domainError("INVALID_STATE", "Chưa có tỷ giá tính thuế – nhập tỷ giá rồi chạy lại agent"));
  // Nguyên tắc 4 mắt (cấu hình org): người duyệt khác người tạo hồ sơ; Chủ sở hữu được miễn.
  if (p.fourEyes && p.role !== "OWNER" && p.userId === p.ownerId) return err(domainError("FORBIDDEN", "Người duyệt phải khác người tạo hồ sơ (nguyên tắc 4 mắt)"));
  return ok(undefined);
}

export function canSubmit(p: { status: DeclarationStatus; blockerFails: number }): Result<void> {
  if (p.status === "SUBMITTED") return err(domainError("ALREADY_SUBMITTED", "Tờ khai đã truyền"));
  if (p.status !== "APPROVED") return err(domainError("NOT_APPROVED", "Tờ khai chưa được phê duyệt"));
  if (p.blockerFails > 0) return err(domainError("BLOCKER_FAILED", `Còn ${p.blockerFails} luật lỗi chặn truyền`));
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
