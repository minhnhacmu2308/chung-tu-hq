import type { DocKind, SkillField, SkillFieldPatch } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

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

export function canAddField(fields: SkillField[], key: string): Result<void> {
  if (fields.some((f) => f.key === key)) return err(domainError("DUPLICATE", "Mã trường đã tồn tại trong skill"));
  return ok(undefined);
}

type Candidate = { id: string; kind: "DOCUMENT" | "SUPPLIER" | "MAPPING"; docKind: DocKind | null; supplier: string | null; enabled: boolean };
const tok = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(" ").filter((w) => w.length > 2);

/** Chọn skill cho (loại chứng từ, gợi ý nhà cung cấp): SUPPLIER khớp tên trước, rồi DOCUMENT; chỉ enabled. */
export function resolveCandidates<T extends Candidate>(skills: T[], kind: DocKind, supplierHint: string | null): T | null {
  const enabled = skills.filter((s) => s.enabled && s.docKind === kind);
  if (supplierHint) {
    const hint = new Set(tok(supplierHint));
    const sup = enabled.find((s) => s.kind === "SUPPLIER" && s.supplier && tok(s.supplier).some((w) => hint.has(w)));
    if (sup) return sup;
  }
  return enabled.find((s) => s.kind === "DOCUMENT") ?? null;
}
