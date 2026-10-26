import { resolveSkillFieldKey, type DocKind, type SkillField, type SkillFieldPatch } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { sameSupplier } from "./learning.js";

export function applyFieldPatch(fields: SkillField[], key: string, patch: SkillFieldPatch): Result<SkillField[]> {
  const f = fields.find((x) => x.key === key);
  if (!f) return err(domainError("NOT_FOUND", "Không tìm thấy trường"));
  if (patch.extract === false && f.required) return err(domainError("FORBIDDEN", "Trường bắt buộc của tờ khai – không tắt trích xuất được"));
  const next: SkillField = { ...f };
  if (patch.label !== undefined) next.label = patch.label;
  if (patch.required !== undefined) next.required = patch.required;
  if (patch.aliases !== undefined) next.aliases = patch.aliases;
  if (patch.declarationField !== undefined) next.declarationField = patch.declarationField;
  if (patch.extract !== undefined) next.extract = patch.extract;
  if (patch.display !== undefined) next.display = patch.display;
  if (patch.extract === false) next.display = false;
  return ok(fields.map((x) => (x.key === key ? next : x)));
}

/** Tối đa trường bổ sung riêng mỗi skill (mỗi trường thêm token cho mọi lần đọc). */
export const MAX_CUSTOM_FIELDS = 20;

export function canAddField(kind: DocKind, fields: SkillField[], key: string): Result<void> {
  if (fields.some((f) => f.key === key)) return err(domainError("DUPLICATE", "Mã trường đã tồn tại trong skill"));
  const isCustom = !resolveSkillFieldKey(kind, key).standard;
  if (isCustom && fields.filter((f) => !resolveSkillFieldKey(kind, f.key).standard).length >= MAX_CUSTOM_FIELDS) {
    return err(domainError("VALIDATION", `Tối đa ${MAX_CUSTOM_FIELDS} trường bổ sung cho một skill`));
  }
  return ok(undefined);
}

/** Trường chuẩn (thuộc danh mục) không xóa được – tắt Đọc/Hiển thị nếu không cần; trường bổ sung xóa được. */
export function canRemoveField(kind: DocKind, fields: SkillField[], key: string): Result<void> {
  if (!fields.some((f) => f.key === key)) return err(domainError("NOT_FOUND", "Không tìm thấy trường"));
  if (resolveSkillFieldKey(kind, key).standard) return err(domainError("FORBIDDEN", "Trường chuẩn của chứng từ không xóa được – tắt Đọc/Hiển thị nếu không cần"));
  return ok(undefined);
}

type Candidate = { id: string; kind: "DOCUMENT" | "SUPPLIER"; docKind: DocKind | null; supplier: string | null; enabled: boolean };

/** Chọn skill cho (loại chứng từ, gợi ý nhà cung cấp): SUPPLIER khớp tên trước, rồi DOCUMENT; chỉ enabled. */
export function resolveCandidates<T extends Candidate>(skills: T[], kind: DocKind, supplierHint: string | null): T | null {
  const enabled = skills.filter((s) => s.enabled && s.docKind === kind);
  if (supplierHint) {
    // So theo từ riêng của tên (bỏ "CO., LTD"…): hai công ty khác nhau cùng đuôi "LTD" không khớp nhầm.
    const sup = enabled.find((s) => s.kind === "SUPPLIER" && sameSupplier(s.supplier, supplierHint));
    if (sup) return sup;
  }
  return enabled.find((s) => s.kind === "DOCUMENT") ?? null;
}
