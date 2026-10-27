// Báo cáo tầng nền tảng trên kho "bộ chứng từ + tờ khai thật" (thuần): mỗi chỉ tiêu app điền đúng bao nhiêu %, giá trị thật nằm trên chứng từ nào,
// bao nhiêu % không có trên chứng từ nào → đội phát triển dùng để đặt thứ tự nguồn / viết quy tắc (code có test), không tự áp vào tờ khai.
import type { DocKind, TeachFieldDiff, TeachLineDiff } from "@kb/contracts";
import { COMPARED_FIELDS, findInDocuments, realText, type DocData } from "./compare.js";
import type { CustomsDeclarationExtraction } from "@kb/contracts";

export type CorpusLot = { lot: string; mode: string | null; fields: TeachFieldDiff[]; lines: TeachLineDiff[]; real: CustomsDeclarationExtraction; docs: DocData[] };

export type SourceStat = {
  code: string; label: string; mode: string;
  /** Số lô tờ khai thật có ghi chỉ tiêu này. */
  lots: number; matched: number;
  /** Giá trị thật xuất hiện trên loại chứng từ nào (một lô có thể nhiều loại). */
  foundIn: Partial<Record<DocKind, number>>;
  notOnDocuments: number;
  /** Vài ví dụ lệch để xem nhanh. */
  examples: { lot: string; draft: string; real: string }[];
};

/** Thống kê theo (chỉ tiêu, phương thức vận chuyển): khớp, nguồn chứa giá trị thật, không có trên chứng từ. */
export function sourceStats(lots: CorpusLot[]): SourceStat[] {
  const by = new Map<string, SourceStat>();
  for (const l of lots) {
    const mode = l.mode ?? "?";
    for (const { code, type } of COMPARED_FIELDS) {
      const real = realText(l.real, code);
      if (!real) continue;
      const diff = l.fields.find((f) => f.code === code);
      const key = `${code}|${mode}`;
      const s = by.get(key) ?? { code, label: diff?.label ?? code, mode, lots: 0, matched: 0, foundIn: {}, notOnDocuments: 0, examples: [] };
      s.lots++;
      if (diff?.kind === "MATCH") s.matched++;
      else if (s.examples.length < 3) s.examples.push({ lot: l.lot, draft: diff?.draft ?? "", real });
      const kinds = findInDocuments(type, real, l.docs);
      if (!kinds.length) s.notOnDocuments++;
      for (const k of kinds) s.foundIn[k] = (s.foundIn[k] ?? 0) + 1;
      by.set(key, s);
    }
  }
  return [...by.values()].sort((a, b) => a.matched / a.lots - b.matched / b.lots || a.code.localeCompare(b.code));
}

export function lineStats(lots: CorpusLot[]): { lines: number; hs: number; description: number; importRate: number; vatRate: number } {
  const all = lots.flatMap((l) => l.lines);
  const eq = (a: string, b: string) => !!b && a === b;
  const words = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return {
    lines: all.length,
    hs: all.filter((x) => eq(x.draftHs, x.realHs)).length,
    description: all.filter((x) => !!x.realDescription && words(x.draftDescription) === words(x.realDescription)).length,
    importRate: all.filter((x) => eq(x.draftImportRate, x.realImportRate)).length,
    vatRate: all.filter((x) => eq(x.draftVatRate, x.realVatRate)).length,
  };
}

const p = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : "–");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").slice(0, 60);

/** rules.md cho đội phát triển: "chỉ tiêu này lấy từ đâu" theo phương thức vận chuyển, chỉ tiêu kém nhất ở trên. */
export function corpusMarkdown(input: { generatedAt: Date; lots: CorpusLot[] }): string {
  const stats = sourceStats(input.lots);
  const ls = lineStats(input.lots);
  const out = [
    "# Chỉ tiêu tờ khai lấy từ đâu – báo cáo trên kho dữ liệu",
    "",
    `${input.lots.length} lô · ${input.generatedAt.toISOString().slice(0, 10)}. "Khớp" = tờ khai nháp app dựng từ bộ chứng từ trùng tờ khai thật. "Có trên" = giá trị thật xuất hiện trên loại chứng từ đó (một lô có thể nhiều loại).`,
    "Chỉ tiêu có tỷ lệ \"Không có trên chứng từ\" cao → học theo doanh nghiệp (mục Dạy khai báo) hoặc quy tắc mặc định; tỷ lệ \"Có trên\" cao mà \"Khớp\" thấp → sửa thứ tự nguồn / cách đọc.",
    "",
    "| Chỉ tiêu | Phương thức | Số lô | Khớp | Có trên chứng từ | Không có trên chứng từ | Ví dụ lệch (app → thật) |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const s of stats) {
    const found = (Object.entries(s.foundIn) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${p(n, s.lots)}`).join(", ") || "–";
    const ex = s.examples.map((e) => `${cell(e.draft) || "(trống)"} → ${cell(e.real)}`).join("; ");
    out.push(`| ${cell(s.label)} (${s.code}) | ${s.mode} | ${s.lots} | ${p(s.matched, s.lots)} | ${found} | ${p(s.notOnDocuments, s.lots)} | ${ex} |`);
  }
  if (ls.lines) out.push("", "## Dòng hàng", "", `${ls.lines} dòng · mã HS khớp ${p(ls.hs, ls.lines)} · mô tả khớp ${p(ls.description, ls.lines)} · thuế NK khớp ${p(ls.importRate, ls.lines)} · GTGT khớp ${p(ls.vatRate, ls.lines)}`);
  out.push("");
  return out.join("\n");
}
