// Chạy eval trên một thư mục lô thật: PDF chứng từ + 1 file Excel đáp án (+ mapping.json tùy chọn).
// AI phân loại + trích xuất như pipeline thật → chấm theo đáp án → gộp hồ sơ → dựng tờ khai → liệt kê chỉ tiêu bắt buộc còn trống.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { catalogHints, extractionSchemaFor, fillMissingNullable, type DocKind } from "@kb/contracts";
import { buildDeclaration } from "../../declaration/index.js";
import type { AiProvider } from "../application/ports.js";
import { mergeExtractions, type FileExtraction } from "../domain/merge.js";
import { parseExpectedWorkbook, scoreDocument, type DocumentScore, type LabelMapping } from "./lot.js";

export type LotDocResult = { file: string; kind: DocKind; sheet: string | null; score: DocumentScore | null; inputTokens: number; outputTokens: number; model: string };
export type LotReport = {
  lot: string; ranAt: string; docs: LotDocResult[]; total: number; matched: number; accuracy: number; warnings: string[];
  /** Chỉ tiêu bắt buộc trên tờ khai còn trống sau khi dựng từ bộ chứng từ (trừ chỉ tiêu chỉ người khai biết). */
  missingRequired: { code: string; label: string }[];
};

/** Chỉ tiêu luôn do người khai/hệ thống cấp, không kỳ vọng có trên chứng từ. */
const MANUAL_ONLY = new Set(["SOTK", "NNK_DC", "NXK_DC", "TY_GIA"]);

export async function runLotEval(ai: AiProvider, dir: string, now = new Date()): Promise<LotReport> {
  const files = readdirSync(dir);
  const xlsx = files.find((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"));
  if (!xlsx) throw new Error(`${dir}: thiếu file Excel đáp án`);
  const mapping = existsSync(path.join(dir, "mapping.json")) ? (JSON.parse(readFileSync(path.join(dir, "mapping.json"), "utf8")) as LabelMapping) : {};
  const expected = await parseExpectedWorkbook(readFileSync(path.join(dir, xlsx)), mapping);
  const pdfs = files.filter((f) => /\.(pdf|png|jpe?g)$/i.test(f));

  const read = await Promise.all(pdfs.map(async (f) => {
    const bytes = readFileSync(path.join(dir, f));
    const mime = /\.png$/i.test(f) ? "image/png" : /\.jpe?g$/i.test(f) ? "image/jpeg" : "application/pdf";
    const file = { bytes, mime, pages: 1, fileName: f };
    const c = await ai.classifyPages(file);
    const main = c.result.documents.find((d) => !d.isDuplicateCopy) ?? c.result.documents[0];
    const kind = main?.kind ?? "OTHER";
    const pages = main?.pages.length ? main.pages : [1];
    const schema = extractionSchemaFor(kind);
    const x = await ai.extract({ ...file, pages: Math.max(...pages) }, pages, schema, { kind, skillHints: catalogHints(kind), examples: [], supplierHint: main?.supplierHint ?? null });
    const data = fillMissingNullable(schema, x.result) as Record<string, unknown>;
    return { file: f, kind, data, usage: [c.usage, x.usage] };
  }));

  const docs: LotDocResult[] = read.map((r) => {
    const sheet = expected.sheets.find((s) => s.kind === r.kind) ?? null;
    return {
      file: r.file, kind: r.kind, sheet: sheet?.sheetName ?? null, score: sheet ? scoreDocument(r.kind, sheet.rows, r.data) : null,
      inputTokens: r.usage.reduce((a, u) => a + u.inputTokens, 0), outputTokens: r.usage.reduce((a, u) => a + u.outputTokens, 0), model: r.usage[1]!.model,
    };
  });
  const warnings = [...expected.warnings, ...expected.sheets.filter((s) => !read.some((r) => r.kind === s.kind)).map((s) => `Sheet "${s.sheetName}" (${s.kind}): không có chứng từ nào được phân loại loại này`)];

  const shipment = mergeExtractions(read.map((r, i): FileExtraction => ({ documentId: `d${i}`, kind: r.kind, pages: 1, data: r.data })), { version: 1 });
  const air = read.some((r) => r.kind === "AIR_WAYBILL");
  const built = buildDeclaration({
    shipment, now,
    dossier: { id: "eval", code: path.basename(dir), direction: "NK", typeCode: "A11", partner: "", customsOfficeCode: "02CI", customsOfficeName: "", status: "NEEDS_REVIEW", step: "review", ownerId: "eval", invoiceValue: "0", currency: "USD", incoterm: "", transportMode: air ? "AIR" : "SEA_CONTAINER", partyClass: "4", billNo: "", declarationNo: null, note: null },
    org: { taxCode: "0000000000", name: "EVAL", address: "", phone: "", fourEyes: false },
    items: shipment.items.map((it, i) => ({ id: `i${i}`, amount: it.amount.value ?? "0", importDutyRate: null, vatRate: null })),
    exchange: { date: now.toISOString().slice(0, 10), rates: { VND: "1", USD: "25400", EUR: "28000", CNY: "3500" }, missing: [] },
  });
  const missingRequired = Object.entries(built.fields).filter(([code, f]) => f.suspect && !f.value && !MANUAL_ONLY.has(code)).map(([code, f]) => ({ code, label: f.label }));

  const total = docs.reduce((a, d) => a + (d.score?.total ?? 0), 0);
  const matched = docs.reduce((a, d) => a + (d.score?.matched ?? 0), 0);
  return { lot: path.basename(dir), ranAt: now.toISOString(), docs, total, matched, accuracy: total ? matched / total : 0, warnings, missingRequired };
}

export function formatLotReport(r: LotReport): string {
  const lines = [`Lô ${r.lot}: ${r.matched}/${r.total} trường khớp = ${(r.accuracy * 100).toFixed(1)}%`];
  for (const d of r.docs) {
    lines.push(`  ${d.file} → ${d.kind}${d.sheet ? ` (sheet "${d.sheet}")` : " (không có đáp án)"}: ${d.score ? `${d.score.matched}/${d.score.total}` : "-"} · ${d.inputTokens}+${d.outputTokens} token`);
    for (const m of d.score?.misses ?? []) lines.push(`      ✗ ${m.label} [${m.key}]: kỳ vọng "${m.expected.replace(/\n/g, " / ")}" · AI "${m.actual.replace(/\n/g, " / ")}"`);
  }
  for (const w of r.warnings) lines.push(`  ! ${w}`);
  lines.push(r.missingRequired.length ? `  Tờ khai còn trống chỉ tiêu bắt buộc: ${r.missingRequired.map((m) => `${m.code} (${m.label})`).join(", ")}` : "  Tờ khai: đủ chỉ tiêu bắt buộc lấy được từ chứng từ");
  return lines.join("\n");
}
