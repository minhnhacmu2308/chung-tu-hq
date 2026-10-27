// Chạy trên kho "bộ chứng từ + tờ khai thật" (mỗi lô một thư mục): AI đọc chứng từ như pipeline thật → gộp → dựng tờ khai nháp (code)
// → AI đọc tờ khai thật → so từng chỉ tiêu, dò giá trị thật nằm trên chứng từ nào. Gọi AI thật – tốn tiền, chạy thử ít lô trước.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogHints, CUSTOMS_DECLARATION_HINTS, CustomsDeclarationExtractionSchema, extractionSchemaFor, fillMissingNullable, type DocKind } from "@kb/contracts";
import { buildDeclaration } from "../../declaration/index.js";
import { mergeExtractions, type AiProvider, type FileExtraction } from "../../extraction/index.js";
import { compareFields, type DocData } from "../domain/compare.js";
import type { CorpusLot } from "../domain/corpus.js";

/** Tên file tờ khai thật: "TK 107139226350.pdf", "ToKhaiHQ7N_….pdf", "to khai….pdf". */
export const isDeclarationFile = (f: string) => /(^tk[\s_-]*\d)|tokhai|t[oờ]\s*khai|declaration/i.test(f.normalize("NFC"));
const mimeOf = (f: string) => (/\.png$/i.test(f) ? "image/png" : /\.jpe?g$/i.test(f) ? "image/jpeg" : "application/pdf");

export type CorpusUsage = { inputTokens: number; outputTokens: number };
export type CorpusLotResult = { lot: CorpusLot | null; warning?: string; usage: CorpusUsage };

export async function runCorpusLot(ai: AiProvider, dir: string, now = new Date()): Promise<CorpusLotResult> {
  const usage: CorpusUsage = { inputTokens: 0, outputTokens: 0 };
  const add = (u: { inputTokens: number; outputTokens: number }) => void ((usage.inputTokens += u.inputTokens), (usage.outputTokens += u.outputTokens));
  const files = readdirSync(dir).filter((f) => /\.(pdf|png|jpe?g)$/i.test(f) && !f.startsWith("."));
  const tkFile = files.find(isDeclarationFile);
  if (!tkFile) return { lot: null, warning: `${path.basename(dir)}: không có file tờ khai thật (PDF tên "TK …" / "Tờ khai …")`, usage };
  const docs: (DocData & { file: string })[] = [];
  for (const f of files.filter((x) => x !== tkFile)) {
    const file = { bytes: readFileSync(path.join(dir, f)), mime: mimeOf(f), pages: 1, fileName: f };
    const c = await ai.classifyPages(file);
    add(c.usage);
    const main = c.result.documents.find((d) => !d.isDuplicateCopy) ?? c.result.documents[0];
    const kind: DocKind = main?.kind ?? "OTHER";
    const pages = main?.pages.length ? main.pages : [1];
    const schema = extractionSchemaFor(kind);
    const x = await ai.extract({ ...file, pages: Math.max(...pages) }, pages, schema, { kind, skillHints: catalogHints(kind), examples: [], supplierHint: main?.supplierHint ?? null });
    add(x.usage);
    docs.push({ file: f, kind, data: fillMissingNullable(schema, x.result) as Record<string, unknown> });
  }
  const tkBytes = readFileSync(path.join(dir, tkFile));
  const tk = await ai.extract({ bytes: tkBytes, mime: mimeOf(tkFile), pages: 1, fileName: tkFile }, [1], CustomsDeclarationExtractionSchema, {
    kind: "OTHER", title: "Đây là tờ khai hải quan đã thông quan (bản in VNACCS)", skillHints: CUSTOMS_DECLARATION_HINTS, examples: [], supplierHint: null,
  });
  add(tk.usage);
  const real = CustomsDeclarationExtractionSchema.safeParse(fillMissingNullable(CustomsDeclarationExtractionSchema, tk.result));
  if (!real.success) return { lot: null, warning: `${path.basename(dir)}: không đọc ra tờ khai trong ${tkFile}`, usage };

  const shipment = mergeExtractions(docs.map((d, i): FileExtraction => ({ documentId: `d${i}`, kind: d.kind, pages: 1, data: d.data })), { version: 1 });
  const mode = docs.some((d) => d.kind === "AIR_WAYBILL") ? "AIR" : docs.some((d) => d.kind === "BILL_OF_LADING") ? (shipment.transport.containers.length ? "SEA_CONTAINER" : "SEA_BULK") : null;
  const built = buildDeclaration({
    shipment, now,
    dossier: { id: "corpus", code: path.basename(dir), direction: "NK", typeCode: real.data.MA_LH ?? "A11", partner: "", customsOfficeCode: real.data.CQHQ ?? "02CI", customsOfficeName: "", status: "NEEDS_REVIEW", step: "review", ownerId: "corpus", invoiceValue: "0", currency: "USD", incoterm: "", transportMode: (mode ?? "OTHER") as "AIR", partyClass: "4", billNo: "", declarationNo: null, note: null },
    org: { taxCode: "0000000000", name: "CORPUS", address: "", phone: "", fourEyes: false },
    items: shipment.items.map((it, i) => ({ id: `i${i}`, amount: it.amount.value ?? "0", importDutyRate: null, vatRate: null })),
    exchange: { date: now.toISOString().slice(0, 10), rates: { VND: "1", USD: "25400", EUR: "28000", CNY: "3500" }, missing: [] },
  });
  const draft = Object.entries(built.fields).map(([code, f]) => ({ code, label: f.label, value: f.value, source: f.source }));
  const plainDocs = docs.map(({ kind, data }) => ({ kind, data }));
  // Dòng hàng: chế độ kho dữ liệu không gọi HSCodePro → chỉ so chỉ tiêu chung.
  return { lot: { lot: path.basename(dir), mode, fields: compareFields(draft, real.data, plainDocs), lines: [], real: real.data, docs: plainDocs }, usage };
}

/** Thư mục con là một lô (bỏ thư mục ẩn). */
export const corpusLots = (root: string) => readdirSync(root).filter((d) => !d.startsWith(".") && statSync(path.join(root, d)).isDirectory()).map((d) => path.join(root, d));
