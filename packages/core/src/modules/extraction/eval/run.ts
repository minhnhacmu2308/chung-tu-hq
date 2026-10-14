// Golden set trích xuất: mỗi lô `evals/golden/<lot>/` gồm PDF + `expected.json` (đường dẫn Shipment → giá trị mong đợi).
// Chạy pipeline đọc (phân loại → trích xuất → gộp) rồi so từng trường; offline dùng FakeAiProvider + fixture, --live gọi AI thật và ghi fixture.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { extractionSchemaFor, type DocKind, type Shipment } from "@kb/contracts";
import { dec } from "../../../shared/decimal.js";
import type { AiProvider } from "../application/ports.js";
import { mergeExtractions, type FileExtraction } from "../domain/merge.js";

export type LotResult = { lot: string; fields: { path: string; expected: string | null; actual: string | null; ok: boolean }[]; accuracy: number };
export type EvalReport = { ranAt: string; provider: string; lots: LotResult[]; accuracy: number };

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
function same(expected: string | null, actual: string | null) {
  if (expected === null || expected === "") return actual === null || actual === "";
  if (actual === null) return false;
  if (/^-?\d+(\.\d+)?$/.test(expected) && /^-?\d+(\.\d+)?$/.test(actual)) return dec(expected).minus(dec(actual)).abs().lte("0.01");
  return norm(expected) === norm(actual);
}
/** "/invoice/no" → s.invoice.no.value; "/items/length" → số dòng. */
function valueAt(s: Shipment, p: string): string | null {
  if (p === "/items/length") return String(s.items.length);
  let cur: unknown = s;
  for (const k of p.split("/").filter(Boolean)) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return null;
  }
  if (cur && typeof cur === "object" && "value" in (cur as object)) return ((cur as { value: unknown }).value ?? null) as string | null;
  return cur === undefined || cur === null ? null : String(cur);
}

export async function readLot(ai: AiProvider, dir: string): Promise<Shipment> {
  const files: FileExtraction[] = [];
  for (const name of readdirSync(dir).filter((f) => /\.(pdf|png|jpe?g)$/i.test(f)).sort()) {
    const bytes = readFileSync(path.join(dir, name));
    const mime = name.toLowerCase().endsWith(".pdf") ? "application/pdf" : name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const file = { bytes, mime, pages: 1, fileName: name };
    const cls = await ai.classifyPages(file);
    for (const d of cls.result.documents.filter((x) => !x.isDuplicateCopy)) {
      const kind = d.kind as DocKind;
      const res = await ai.extract(file, d.pages, extractionSchemaFor(kind), { kind, skillHints: [], examples: [], supplierHint: d.supplierHint });
      const parsed = extractionSchemaFor(kind).safeParse(res.result);
      files.push({ documentId: `eval_${name}`, kind, pages: d.pages.length, data: (parsed.success ? parsed.data : res.result) as Record<string, unknown> });
    }
  }
  return mergeExtractions(files, { version: 1 });
}

export async function runEval(ai: AiProvider, goldenDir: string): Promise<EvalReport> {
  const lots: LotResult[] = [];
  for (const lot of readdirSync(goldenDir).filter((d) => existsSync(path.join(goldenDir, d, "expected.json"))).sort()) {
    const expected = JSON.parse(readFileSync(path.join(goldenDir, lot, "expected.json"), "utf8")) as Record<string, string | null>;
    const shipment = await readLot(ai, path.join(goldenDir, lot));
    const fields = Object.entries(expected).map(([p, exp]) => {
      const actual = valueAt(shipment, p);
      return { path: p, expected: exp, actual, ok: same(exp, actual) };
    });
    lots.push({ lot, fields, accuracy: fields.length ? fields.filter((f) => f.ok).length / fields.length : 1 });
  }
  const all = lots.flatMap((l) => l.fields);
  return { ranAt: new Date().toISOString(), provider: ai.name, lots, accuracy: all.length ? all.filter((f) => f.ok).length / all.length : 1 };
}

export function formatReport(r: EvalReport): string {
  const lines = [`Eval trích xuất · provider=${r.provider} · ${r.ranAt}`];
  for (const l of r.lots) {
    lines.push(`\n[${l.lot}] ${(l.accuracy * 100).toFixed(1)}% (${l.fields.filter((f) => f.ok).length}/${l.fields.length})`);
    for (const f of l.fields.filter((x) => !x.ok)) lines.push(`  ✗ ${f.path}: mong đợi "${f.expected ?? ""}" – đọc được "${f.actual ?? ""}"`);
  }
  lines.push(`\nTổng: ${(r.accuracy * 100).toFixed(1)}%`);
  return lines.join("\n");
}

export function saveReport(r: EvalReport, resultsDir: string, tag: string) {
  mkdirSync(resultsDir, { recursive: true });
  const file = path.join(resultsDir, `${tag}.json`);
  writeFileSync(file, JSON.stringify(r, null, 2));
  return file;
}

/** So hai báo cáo: trường đổi đúng↔sai. */
export function diffReports(before: EvalReport, after: EvalReport): string {
  const key = (l: string, p: string) => `${l}:${p}`;
  const a = new Map(before.lots.flatMap((l) => l.fields.map((f) => [key(l.lot, f.path), f.ok] as const)));
  const lines = [`Trước ${(before.accuracy * 100).toFixed(1)}% → sau ${(after.accuracy * 100).toFixed(1)}%`];
  for (const l of after.lots) for (const f of l.fields) {
    const was = a.get(key(l.lot, f.path));
    if (was !== undefined && was !== f.ok) lines.push(`  ${f.ok ? "✓ sửa được" : "✗ hỏng"} ${l.lot}:${f.path} (${f.actual ?? ""})`);
  }
  return lines.join("\n");
}
