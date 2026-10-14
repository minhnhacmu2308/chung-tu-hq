// Đo độ chính xác của skill trên mẫu đã gắn nhãn: so expected (người duyệt) với actual (model) theo kiểu trường. Thuần.
import type { SkillField } from "@kb/contracts";
import { dec } from "../../../shared/decimal.js";

const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[\s\-_/.,:;]+/g, " ").trim();
/** JSON với key sắp xếp – jsonb của Postgres không giữ thứ tự key. */
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v ?? null));
const nameTokens = (v: unknown) => new Set(norm(v).replace(/\b(CO|LTD|LIMITED|COMPANY|CORP|INC|JSC|LLC|GMBH|TNHH|CONG TY)\b/g, "").split(" ").filter(Boolean));

export function compareFields(type: SkillField["type"], expected: unknown, actual: unknown): boolean {
  const eNull = expected === null || expected === undefined || expected === "";
  const aNull = actual === null || actual === undefined || actual === "";
  if (eNull || aNull) return eNull && aNull;
  switch (type) {
    case "decimal": {
      try {
        return dec(String(expected)).minus(dec(String(actual))).abs().lte("0.01");
      } catch {
        return false;
      }
    }
    case "party": {
      const a = nameTokens((expected as { name?: unknown })?.name ?? expected);
      const b = nameTokens((actual as { name?: unknown })?.name ?? actual);
      if (!a.size || !b.size) return false;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      return inter / (a.size + b.size - inter) >= 0.6;
    }
    case "items":
      return stable(expected) === stable(actual);
    default:
      return norm(expected) === norm(actual);
  }
}

/** Điểm từng trường của một mẫu (chỉ trường extract=true). */
export function scoreSample(fields: SkillField[], expected: Record<string, unknown>, actual: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of fields.filter((x) => x.extract)) out[f.key] = compareFields(f.type, expected[f.key], actual[f.key]);
  return out;
}

export function summarize(fields: SkillField[], scores: Record<string, boolean>[]): { accuracy: number; fields: { key: string; label: string; accuracy: number; errors: number }[] } {
  const per = fields
    .filter((x) => x.extract)
    .map((f) => {
      const vals = scores.map((s) => s[f.key]).filter((v): v is boolean => v !== undefined);
      const ok = vals.filter(Boolean).length;
      return { key: f.key, label: f.label, accuracy: vals.length ? ok / vals.length : 0, errors: vals.length - ok };
    });
  const total = per.reduce((n, f) => n + f.errors, 0);
  const count = scores.length * per.length;
  return { accuracy: count ? (count - total) / count : 0, fields: per };
}
