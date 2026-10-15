import type { DocKind } from "../common.js";
import { DOC_CATALOG } from "./documents.js";

export * from "./types.js";
export { DOC_CATALOG } from "./documents.js";

/** Phiên bản danh mục trường chuẩn (tăng khi thêm trường; key cũ không đổi). */
export const DOC_CATALOG_VERSION = 2;

/** Chuẩn hóa nhãn để so khớp: bỏ dấu tiếng Việt, đ→d, chữ thường, dấu câu thành khoảng trắng. */
export function normalizeLabel(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Nhãn tiếng Việt của một trường (phần đầu hoặc dòng). */
export function catalogFieldLabel(kind: DocKind, key: string): string | null {
  const c = DOC_CATALOG[kind];
  return c.fields.find((x) => x.key === key)?.label ?? c.items?.fields.find((x) => x.key === key)?.label ?? null;
}

/** Tìm trường theo nhãn hoặc nhãn thường gặp (ưu tiên phần đầu chứng từ, rồi đến dòng). */
export function findCatalogField(kind: DocKind, labelOrAlias: string): { key: string; item: boolean } | null {
  const want = normalizeLabel(labelOrAlias);
  if (!want) return null;
  const c = DOC_CATALOG[kind];
  const hit = (defs: { key: string; label: string; aliases: string[] }[]) => defs.find((d) => [d.label, ...d.aliases].some((l) => normalizeLabel(l) === want));
  const head = hit(c.fields);
  if (head) return { key: head.key, item: false };
  const item = c.items ? hit(c.items.fields) : undefined;
  return item ? { key: item.key, item: true } : null;
}
export * from "./skill-keys.js";

/** Gợi ý đọc theo danh mục chuẩn (khi doanh nghiệp chưa cấu hình skill): "Nhãn (key): nhãn thường gặp a | b". */
export function catalogHints(kind: DocKind): string[] {
  const c = DOC_CATALOG[kind];
  const line = (f: { key: string; label: string; aliases: string[] }, prefix = "") => `${f.label} (${prefix}${f.key})${f.aliases.length ? `: nhãn thường gặp ${f.aliases.join(" | ")}` : ""}`;
  return [...c.fields.map((f) => line(f)), ...(c.items ? c.items.fields.map((f) => line(f, `${c.items!.key}[].`)) : [])];
}
