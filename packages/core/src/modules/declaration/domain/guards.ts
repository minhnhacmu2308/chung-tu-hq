// Điều kiện chuyển bước/duyệt/truyền (bất biến 7: không truyền khi còn BLOCKER FAIL hoặc HS chưa xác nhận). Thuần.
import { CATALOG_EDA, CATALOG_IDA, isDeclarationFieldEditable, type DeclarationFieldDef, type DeclarationStatus, type Role } from "@kb/contracts";
import { dec } from "../../../shared/decimal.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mappingsFor } from "./mapping/registry.js";

type ItemHs = { hsConfirmed: string | null };
const unconfirmed = (items: ItemHs[]) => items.filter((i) => !i.hsConfirmed).length;

export function canMoveToReview(items: ItemHs[], hasDeclaration: boolean): Result<void> {
  const n = unconfirmed(items);
  if (n > 0) return err(domainError("HS_UNCONFIRMED", `Còn ${n} mã HS chưa xác nhận`));
  if (!hasDeclaration) return err(domainError("NO_DECLARATION", "Chưa dựng tờ khai – chạy agent với lựa chọn có “Tạo tờ khai”"));
  return ok(undefined);
}

/** Chỉ tiêu bắt buộc (theo ánh xạ VNACCS) đang trống – FPT sẽ từ chối, nên chặn ngay ở bước duyệt. */
export function missingRequiredFields(kind: "IDA" | "EDA", fields: Record<string, { value: string }>): { code: string; label: string }[] {
  return mappingsFor(kind).filter((m) => m.required && !fields[m.code]?.value?.trim()).map((m) => ({ code: m.code, label: m.label }));
}

export function canApprove(p: { role: Role; userId: string; ownerId: string; fourEyes: boolean; blockerFails: number; items: ItemHs[]; status: DeclarationStatus; exchangeRate?: string; missingFields?: { code: string; label: string }[] }): Result<void> {
  if (p.role !== "APPROVER" && p.role !== "OWNER") return err(domainError("FORBIDDEN", "Chỉ Người duyệt hoặc Chủ sở hữu được phê duyệt tờ khai"));
  if (p.status !== "DRAFT") return err(domainError("INVALID_STATE", p.status === "NOT_CREATED" ? "Chưa có tờ khai" : "Tờ khai đã được duyệt"));
  if (p.blockerFails > 0) return err(domainError("BLOCKER_FAILED", `Còn ${p.blockerFails} luật lỗi chặn truyền – xử lý ở bước OCR & kiểm tra`));
  const n = unconfirmed(p.items);
  if (n > 0) return err(domainError("HS_UNCONFIRMED", `Còn ${n} mã HS chưa xác nhận`));
  if (p.exchangeRate !== undefined && dec(p.exchangeRate).isZero()) return err(domainError("INVALID_STATE", "Chưa có tỷ giá tính thuế – nhập tỷ giá rồi chạy lại agent"));
  // Nguyên tắc 4 mắt (cấu hình org): người duyệt khác người tạo hồ sơ; Chủ sở hữu được miễn.
  if (p.fourEyes && p.role !== "OWNER" && p.userId === p.ownerId) return err(domainError("FORBIDDEN", "Người duyệt phải khác người tạo hồ sơ (nguyên tắc 4 mắt)"));
  // Sau kiểm quyền: người không được duyệt nhận FORBIDDEN, không phải danh sách chỉ tiêu.
  if (p.missingFields?.length) {
    const names = p.missingFields.map((f) => f.label);
    return err(domainError("VALIDATION", `Còn ${names.length} chỉ tiêu bắt buộc chưa nhập: ${names.join(", ")} – bấm Sửa ở từng chỉ tiêu rồi duyệt lại`, { missingFields: p.missingFields }));
  }
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
 * và giá trị sai kiểu số/ngày theo catalog Phụ lục II (chỉ áp khi số chỉ tiêu ứng với đúng một ô – ô ghép như 1.44 bỏ qua).
 */
export function canEditField(kind: "IDA" | "EDA", code: string, value: string): Result<void> {
  if (!isDeclarationFieldEditable(code)) return err(domainError("VALIDATION", "Chỉ tiêu này không sửa tay trên tờ khai: số tờ khai do Hải quan cấp, loại hình đổi ở hồ sơ, trị giá/cước/tỷ giá sửa ở bước đọc chứng từ rồi dựng lại"));
  const mappings = mappingsFor(kind);
  const mapping = mappings.find((m) => m.code === code);
  if (value === "") return mapping?.required ? err(domainError("VALIDATION", "Chỉ tiêu bắt buộc – không được để trống")) : ok(undefined);
  if (!mapping?.no || mappings.filter((m) => m.no === mapping.no).length !== 1) return ok(undefined);
  const def = (kind === "IDA" ? CATALOG_IDA : CATALOG_EDA).find((d) => d.no === mapping.no);
  const format = def ? FIELD_FORMATS[def.type] : undefined;
  return format && !format.test(value) ? err(domainError("VALIDATION", format.message)) : ok(undefined);
}
