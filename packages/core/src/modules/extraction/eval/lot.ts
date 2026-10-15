// Eval trên lô chứng từ thật: đáp án là Excel người khai lập tay (mỗi chứng từ một sheet: STT | Tên trường | Trị giá).
// Đọc đáp án → khớp nhãn theo danh mục trường chuẩn → so với kết quả AI có chuẩn hóa (chữ, số kiểu VN, ngày, trường gộp).
import ExcelJS from "exceljs";
import { DOC_CATALOG, findCatalogField, normalizeLabel, type DocFieldType, type DocKind } from "@kb/contracts";

export type ExpectedRow = { label: string; key: string | null; item: boolean; value: string };
export type ExpectedSheet = { sheetName: string; kind: DocKind; rows: ExpectedRow[] };
/** mapping.json trong thư mục lô: { "<LOẠI>": { "<nhãn trong Excel>": "<key danh mục>" } }. */
export type LabelMapping = Partial<Record<DocKind, Record<string, string>>>;

export function guessKindFromSheet(name: string): DocKind | null {
  const n = normalizeLabel(name);
  if (/\bcuoc\b/.test(n)) return "FREIGHT_INVOICE";
  if (/\bh?awb\b|airway/.test(n)) return "AIR_WAYBILL";
  if (/arrival|thong bao hang den|\ban\b/.test(n)) return "ARRIVAL_NOTICE";
  if (/\bh?bl\b|lading|\bbill\b/.test(n)) return "BILL_OF_LADING";
  if (/packing|\bpl\b/.test(n)) return "PACKING_LIST";
  if (/invoice|\binv\b/.test(n)) return "INVOICE";
  if (/^co\b|\bform e\b|certificate|\bc o\b/.test(n)) return "CERT_OF_ORIGIN";
  if (/contract/.test(n)) return "SALES_CONTRACT";
  return null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return iso(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
  }
  return String(v).trim();
}

function keyIsItem(kind: DocKind, key: string): boolean {
  return !DOC_CATALOG[kind].fields.some((f) => f.key === key) && !!DOC_CATALOG[kind].items?.fields.some((f) => f.key === key);
}

export async function parseExpectedWorkbook(buf: Buffer | ArrayBuffer, mapping: LabelMapping = {}): Promise<{ sheets: ExpectedSheet[]; warnings: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const sheets: ExpectedSheet[] = [];
  const warnings: string[] = [];
  for (const ws of wb.worksheets) {
    const kind = guessKindFromSheet(ws.name);
    if (!kind) {
      warnings.push(`${ws.name}: không đoán được loại chứng từ từ tên sheet`);
      continue;
    }
    const rows: ExpectedRow[] = [];
    ws.eachRow((row) => {
      const label = cellText(row.getCell(2).value);
      const value = cellText(row.getCell(3).value);
      if (normalizeLabel(label) === "ten truong") return; // dòng tiêu đề
      if (!label && !value) return;
      const mapped = mapping[kind]?.[label];
      const hit = mapped ? { key: mapped, item: keyIsItem(kind, mapped) } : findCatalogField(kind, label);
      if (!hit) warnings.push(`${ws.name}: không khớp trường cho "${label}"`);
      rows.push({ label, key: hit?.key ?? null, item: hit?.item ?? false, value });
    });
    sheets.push({ sheetName: ws.name, kind, rows });
  }
  return { sheets, warnings };
}

// ---------------------------------------------------------------- so sánh

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SYNONYMS: [RegExp, string][] = [[/\bex\s*works\b/g, "exw"], [/\bfree on board\b/g, "fob"], [/\bviet\s*nam\b/g, "vietnam"]];

function tokens(v: unknown): string[] {
  if (v === null || v === undefined || v === "") return [];
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).filter((x) => typeof x === "string").flatMap(tokens);
  const s = String(v);
  const extra: string[] = [];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (m) extra.push(m[1]!, m[2]!, m[3]!, String(Number(m[3])), MONTHS[Number(m[2]) - 1]!);
  let t = normalizeLabel(s);
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  // Tách chỗ chữ ↔ số: "21dec" → 21 dec, "s079" → s 079.
  const base = t.replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2").split(" ").filter(Boolean);
  return [...base, ...extra];
}

const coverage = (expected: unknown, actualParts: unknown[]) => {
  const exp = tokens(expected);
  const act = new Set(actualParts.flatMap(tokens));
  if (!exp.length || !act.size) return 0;
  return exp.filter((t) => act.has(t)).length / exp.length;
};

function numberCandidates(s: string): number[] {
  const m = /-?\d[\d.,]*/.exec(s);
  if (!m) return [];
  const raw = m[0].replace(/[.,]$/, "");
  const out = new Set<number>();
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) out.add(Number(raw.replace(/\./g, ""))); // 6.247.699 (VN)
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) out.add(Number(raw.replace(/,/g, ""))); // 6,247,699.5 (US)
  const plain = Number(raw.replace(/,/g, "."));
  if (!Number.isNaN(plain)) out.add(plain);
  return [...out];
}

function toIso(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /^([a-z]{3})[a-z]*[.\s]*(\d{1,2})[,.\s]+(\d{4})$/i.exec(t);
  if (m) {
    const mo = MONTHS.indexOf(m[1]!.toLowerCase());
    if (mo >= 0) return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  return null;
}

/** So một ô đáp án với giá trị AI (có thể gồm nhiều trường gộp lại). */
export function compareValue(_label: string, expected: string, actualParts: unknown[], type: DocFieldType): boolean {
  const parts = actualParts.filter((x) => x !== null && x !== undefined && x !== "");
  if (!expected.trim()) return parts.length === 0;
  if (!parts.length) return false;
  if (type === "boolean") return !/^(khong|no|false|0)$/.test(normalizeLabel(expected)) && parts.includes(true);
  if (type === "number") {
    const a = parts.map((p) => (typeof p === "number" ? p : Number(String(p).replace(/,/g, "")))).find((n) => !Number.isNaN(n));
    const cands = numberCandidates(expected);
    if (a !== undefined && cands.length) return cands.some((c) => Math.abs(c - a) < 0.001);
  }
  if (type === "code" && parts.length === 1) {
    // Mã định danh (số vận đơn, AWB, C/O…): so sau khi bỏ ký tự ngăn cách.
    const strip = (v: unknown) => normalizeLabel(String(v)).replace(/\s+/g, "");
    if (strip(expected) === strip(parts[0])) return true;
  }
  if (type === "date") {
    const e = toIso(expected);
    const a = parts.map((p) => toIso(String(p))).find(Boolean);
    if (e && a) return e === a;
  }
  return coverage(expected, parts) >= 0.85;
}

/** Ô đáp án gộp nhiều trường của danh mục (vd "Ocean Vessel" = tàu + chuyến). */
const COMPOSITE: Record<string, string[]> = {
  "BILL_OF_LADING.vessel": ["vessel", "voyage"],
  "BILL_OF_LADING.placeOfIssue": ["placeOfIssue", "dateOfIssue", "date"],
  "CERT_OF_ORIGIN.transportName": ["departureDate", "transportName", "portOfLoading", "portOfDischarge"],
  "CERT_OF_ORIGIN.invoiceNo": ["invoiceNo", "invoiceDate"],
  "AIR_WAYBILL.flight": ["flight", "flightDate"],
  "ARRIVAL_NOTICE.vessel": ["vessel", "flightNo"],
  "ARRIVAL_NOTICE.warehouseName": ["warehouseCode", "warehouseName"],
  "INVOICE.incoterm": ["incoterm", "incotermPlace"],
};

export type DocumentScore = { total: number; matched: number; misses: { label: string; key: string; expected: string; actual: string }[] };

const show = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "object" ? Object.values(v as Record<string, unknown>).filter(Boolean).join(" / ") : String(v));

export function scoreDocument(kind: DocKind, rows: ExpectedRow[], data: Record<string, unknown>): DocumentScore {
  const c = DOC_CATALOG[kind];
  const list = c.items ? ((data[c.items.key] as Record<string, unknown>[] | undefined) ?? []) : [];
  const res: DocumentScore = { total: 0, matched: 0, misses: [] };
  for (const r of rows) {
    if (!r.key) continue;
    res.total++;
    const def = (r.item ? c.items?.fields : c.fields)?.find((f) => f.key === r.key);
    const type = def?.type ?? "text";
    const keys = COMPOSITE[`${kind}.${r.key}`] ?? [r.key];
    const candidates = r.item ? list.map((it) => keys.map((k) => it?.[k])) : [keys.map((k) => data[k])];
    const ok = candidates.some((parts) => compareValue(r.label, r.value, parts, keys.length > 1 && type !== "date" ? "text" : type));
    if (ok) res.matched++;
    else res.misses.push({ label: r.label, key: r.key, expected: r.value, actual: (candidates[0] ?? []).map(show).filter(Boolean).join(" | ") });
  }
  return res;
}
