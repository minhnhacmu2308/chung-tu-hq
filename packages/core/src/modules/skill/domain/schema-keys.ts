// Trường của skill ↔ kết quả trích xuất. Trường chuẩn đọc theo key danh mục (@kb/contracts DOC_CATALOG);
// trường bổ sung riêng nằm trong `result.custom`. Dùng khi gắn nhãn mẫu, đo độ chính xác và gợi ý prompt. Thuần.
import { resolveSkillFieldKey, type DocKind, type SkillField } from "@kb/contracts";

/** Chiếu kết quả AI sang bản ghi theo key trường skill (chỉ trường extract=true; thiếu → null). */
export function projectResult(kind: DocKind, fields: SkillField[], result: unknown): Record<string, unknown> {
  const src = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  const custom = (src["custom"] && typeof src["custom"] === "object" ? src["custom"] : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields.filter((x) => x.extract)) {
    const r = resolveSkillFieldKey(kind, f.key);
    const v = r.standard ? (src[f.key] ?? src[r.key]) : custom[f.key];
    out[f.key] = v === undefined ? null : v;
  }
  return out;
}

/** Gợi ý cho prompt: nhãn + key + nhãn thường gặp của từng trường cần đọc. */
export function fieldHints(kind: DocKind, fields: SkillField[]): string[] {
  return fields.filter((f) => f.extract).map((f) => {
    const r = resolveSkillFieldKey(kind, f.key);
    const where = r.standard ? r.key : `custom.${f.key} – trường bổ sung`;
    return f.aliases.length ? `${f.label} (${where}): nhãn thường gặp ${f.aliases.join(" | ")}` : `${f.label} (${where})`;
  });
}
