// Gác cổng 3 ngôn ngữ (.claude/rules/ho-tro-3-ngon-ngu.md): MỌI bộ nhãn *.messages.ts phải dịch đủ vi/en/zh.
// TypeScript chỉ bắt thiếu khóa; test này bắt bản dịch rỗng, chép nguyên tiếng Việt sang en/zh, lệch biến {n}.
import { describe, expect, it } from "vitest";

const LOCALES = ["vi", "en", "zh"] as const;
/** Chữ tiếng Việt có dấu – xuất hiện trong bản en/zh nghĩa là chưa dịch. */
const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
/** Tên riêng giữ nguyên ở mọi ngôn ngữ (có dấu tiếng Việt). Thêm vào đây khi thật sự là tên riêng. */
const PROPER_NOUNS = [/KhaiBáo/g, /Kho CFS Tân Vũ/g];
/** Phần đầu/đuôi câu được phép rỗng ở ngôn ngữ khác (ngữ pháp khác nhau: "Còn {n} …" ↔ "{n} … remaining"). */
const MAY_BE_EMPTY = /(Prefix|Suffix)$/;

type Catalog = Record<(typeof LOCALES)[number], Record<string, unknown>>;
const modules = import.meta.glob<Record<string, unknown>>("/src/**/*.messages.ts", { eager: true });

function catalogs(): { name: string; catalog: Catalog }[] {
  const out: { name: string; catalog: Catalog }[] = [];
  for (const [file, mod] of Object.entries(modules)) {
    for (const [exp, value] of Object.entries(mod)) {
      if (value && typeof value === "object" && LOCALES.every((l) => typeof (value as Record<string, unknown>)[l] === "object")) out.push({ name: `${file.replace("/src/", "")} › ${exp}`, catalog: value as Catalog });
    }
  }
  return out;
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const withoutProperNouns = (s: string) => PROPER_NOUNS.reduce((acc, re) => acc.replace(re, ""), s);

describe("bộ nhãn 3 ngôn ngữ", () => {
  const all = catalogs();

  it("tìm thấy các bộ nhãn", () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it("đủ khóa, không rỗng, en/zh đã dịch (không còn chữ tiếng Việt), biến {x} khớp nhau", () => {
    const problems: string[] = [];
    for (const { name, catalog } of all) {
      const keys = Object.keys(catalog.vi);
      for (const l of LOCALES) {
        const missing = keys.filter((k) => !(k in catalog[l]));
        const extra = Object.keys(catalog[l]).filter((k) => !(k in catalog.vi));
        if (missing.length || extra.length) problems.push(`${name} [${l}] lệch khóa: thiếu ${missing.join(", ") || "–"}; thừa ${extra.join(", ") || "–"}`);
      }
      for (const k of keys) {
        const vi = catalog.vi[k];
        if (typeof vi !== "string") continue;
        for (const l of LOCALES) {
          const v = catalog[l][k];
          if (typeof v !== "string" || (v.trim() === "" && vi.trim() !== "" && !MAY_BE_EMPTY.test(k))) {
            problems.push(`${name}.${k} [${l}] rỗng`);
            continue;
          }
          if (l !== "vi" && VI_CHARS.test(withoutProperNouns(v))) problems.push(`${name}.${k} [${l}] chưa dịch: "${v}"`);
          if (vars(v) !== vars(vi)) problems.push(`${name}.${k} [${l}] biến khác bản vi: {${vars(v)}} ≠ {${vars(vi)}}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
