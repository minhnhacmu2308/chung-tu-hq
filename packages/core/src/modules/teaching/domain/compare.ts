// So tờ khai nháp (app dựng từ bộ chứng từ) với tờ khai thật đã thông quan, từng ô; ô lệch → dò xem giá trị thật có trên chứng từ nào. Thuần.
import type { CustomsDeclarationExtraction, CustomsDeclarationLine, DocKind, TeachDiffKind, TeachFieldDiff, TeachLineDiff } from "@kb/contracts";

/** Cách so một chỉ tiêu: mã (phần trước " – "), định danh (bỏ khoảng trắng/dấu), chữ, số, ngày, tiền (số lớn nhất trong ô), danh sách mã. */
export type CompareType = "code" | "ident" | "text" | "number" | "date" | "money" | "codes";

/** Chỉ tiêu được chấm. Bỏ: số/ngày tờ khai, người nhập khẩu (tài khoản), số quản lý nội bộ, tỷ giá (theo ngày khai). */
export const COMPARED_FIELDS: { code: keyof CustomsDeclarationExtraction & string; type: CompareType }[] = [
  { code: "MA_LH", type: "code" }, { code: "PTVC", type: "code" }, { code: "CQHQ", type: "code" },
  { code: "NXK_TEN", type: "text" }, { code: "NXK_DC", type: "text" }, { code: "MA_NUOC", type: "code" },
  { code: "SO_VD", type: "ident" }, { code: "SO_KIEN", type: "text" }, { code: "TRONG_LUONG", type: "number" },
  { code: "KHO", type: "code" }, { code: "CANG_DO", type: "code" }, { code: "CANG_XEP", type: "code" }, { code: "PTVC_TEN", type: "ident" }, { code: "NGAY_DEN", type: "date" },
  { code: "HD_PL", type: "code" }, { code: "SO_HD", type: "ident" }, { code: "NGAY_HD", type: "date" }, { code: "PT_TT", type: "code" },
  { code: "GIA_PL", type: "code" }, { code: "DK_GIA", type: "code" }, { code: "MA_TT", type: "code" }, { code: "TONG_TG", type: "number" },
  { code: "KHAI_TG", type: "code" }, { code: "CT_TG", type: "text" }, { code: "PHI_VC", type: "money" }, { code: "PHI_BH", type: "code" },
  { code: "VBPQ", type: "codes" }, { code: "NGUOI_NT", type: "code" }, { code: "GHI_CHU", type: "text" },
];

export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toUpperCase();
const words = (s: string) => fold(s).replace(/[^A-Z0-9]+/g, " ").trim();
/** "VNSGN – Cảng Sài Gòn (TP.HCM)" → "VNSGN"; "D – Không bảo hiểm" → "D". */
export const codePart = (s: string) => words(s.split(/\s+[–-]\s+/)[0] ?? "").split(" ")[0] ?? "";
const ident = (s: string) => fold(s).replace(/[^A-Z0-9]/g, "");

/** Mọi cách hiểu số trong chuỗi: 2.188.485 (VN), 2,188,485.5 (US), 608,58 / 608.58. */
export function numbers(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(/-?\d[\d.,]*/g)) {
    const raw = m[0].replace(/[.,]$/, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) out.push(Number(raw.replace(/\./g, "").replace(",", ".")));
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) out.push(Number(raw.replace(/,/g, "")));
    else out.push(Number(raw.replace(",", ".")));
  }
  return out.filter((n) => !Number.isNaN(n));
}

const isoOf = (s: string): string | null => {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
};

export function sameValue(type: CompareType, draft: string, real: string): boolean {
  const d = draft.trim();
  const r = real.trim();
  if (!d || !r) return !d && !r;
  switch (type) {
    case "code": return codePart(d) === codePart(r);
    case "ident": return ident(d) === ident(r) || (ident(r).endsWith(ident(d)) && ident(d).length >= 6);
    case "number": {
      const [a] = numbers(d);
      const [b] = numbers(r);
      return a !== undefined && b !== undefined && Math.abs(a - b) < 0.005;
    }
    case "date": return isoOf(d) !== null && isoOf(d) === isoOf(r);
    case "money": {
      const max = (s: string) => Math.max(...numbers(s), 0);
      return max(d) > 0 && Math.abs(max(d) - max(r)) < 0.005;
    }
    case "codes": {
      const set = (s: string) => new Set(words(s).split(" ").filter(Boolean));
      const a = set(d);
      const b = set(r);
      return a.size === b.size && [...a].every((x) => b.has(x));
    }
    default: return words(d) === words(r);
  }
}

export type DocData = { kind: DocKind; data: Record<string, unknown> };

/** Mọi giá trị chữ/số trong dữ liệu model đọc của một chứng từ. */
function leaves(v: unknown, out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (typeof v === "string" || typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) for (const x of v) leaves(x, out);
  else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k !== "uncertainties") leaves(x, out);
  return out;
}

/** Giá trị thật có trên chứng từ nào (so theo cùng kiểu với ô): dùng để tách "app lấy sai" khỏi "chứng từ không có". */
export function findInDocuments(type: CompareType, real: string, docs: DocData[]): DocKind[] {
  const r = real.trim();
  if (!r) return [];
  const hit = (leaf: string): boolean => {
    switch (type) {
      case "code": case "ident": {
        const want = type === "code" ? codePart(r) : ident(r);
        return want.length >= 2 && (ident(leaf) === want || words(leaf).split(" ").includes(want));
      }
      case "number": case "money": {
        const want = type === "money" ? Math.max(...numbers(r), 0) : numbers(r)[0];
        return want !== undefined && want > 0 && numbers(leaf).some((n) => Math.abs(n - want) < 0.005);
      }
      case "date": return isoOf(leaf) !== null && isoOf(leaf) === isoOf(r);
      default: {
        const a = words(r);
        const b = words(leaf);
        return a.length >= 4 && b.length >= 4 && (b.includes(a) || (a.includes(b) && b.length >= a.length * 0.6));
      }
    }
  };
  return [...new Set(docs.filter((d) => leaves(d.data).some(hit)).map((d) => d.kind))];
}

/** Giá trị thật của một ô dạng chuỗi (số → chuỗi; KHO kèm tên kho để hiển thị). */
export function realText(real: CustomsDeclarationExtraction, code: string): string {
  const v = (real as Record<string, unknown>)[code];
  if (v === null || v === undefined) return "";
  if (code === "KHO" && real.KHO_TEN) return `${String(v)} – ${real.KHO_TEN}`;
  return String(v);
}

export type DraftField = { code: string; label: string; value: string; source: string };

export function compareFields(draft: DraftField[], real: CustomsDeclarationExtraction, docs: DocData[]): TeachFieldDiff[] {
  const byCode = new Map(draft.map((f) => [f.code, f]));
  return COMPARED_FIELDS.flatMap(({ code, type }) => {
    const d = byCode.get(code);
    if (!d) return [];
    const r = realText(real, code);
    if (!r && !d.value) return [];
    const match = sameValue(type, d.value, r);
    const foundIn = match ? [] : findInDocuments(type, r, docs);
    const kind: TeachDiffKind = match ? "MATCH" : foundIn.length ? "DOCUMENT" : "KNOWLEDGE";
    return [{ code, label: d.label, draft: d.value, real: r, kind, foundIn }];
  });
}

export type DraftLine = { lineNo: number; description: string; amount: string; hs: string | null; importRate: string | null; vatRate: string | null; partNo: string | null };

const hs8 = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const rate = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? "" : String(Number(String(s).replace(",", "."))));

/** Ghép dòng tờ khai thật ↔ dòng nháp: cùng số dòng nếu hai bên bằng nhau, không thì theo trị giá dòng. */
export function pairLines(draft: DraftLine[], real: CustomsDeclarationLine[]): { draft: DraftLine | null; real: CustomsDeclarationLine }[] {
  if (draft.length === real.length) return real.map((r, i) => ({ draft: [...draft].sort((a, b) => a.lineNo - b.lineNo)[i] ?? null, real: r }));
  const used = new Set<number>();
  return real.map((r) => {
    const d = draft.find((x) => !used.has(x.lineNo) && r.invoiceValue !== null && Math.abs(Number(x.amount) - r.invoiceValue) < 0.005)
      ?? draft.find((x) => !used.has(x.lineNo) && x.lineNo === r.lineNo) ?? null;
    if (d) used.add(d.lineNo);
    return { draft: d, real: r };
  });
}

export function compareLines(pairs: { draft: DraftLine | null; real: CustomsDeclarationLine }[]): TeachLineDiff[] {
  return pairs.map(({ draft: d, real: r }) => ({
    lineNo: r.lineNo,
    draftHs: hs8(d?.hs), realHs: hs8(r.hsCode),
    draftDescription: d?.description ?? "", realDescription: r.description ?? "",
    draftImportRate: rate(d?.importRate), realImportRate: rate(r.importRate),
    draftVatRate: rate(d?.vatRate), realVatRate: rate(r.vatRate),
  }));
}

/** Đếm ô khớp: chỉ tiêu chung + mỗi dòng 4 ô (HS, mô tả, thuế NK, thuế GTGT). */
export function score(fields: TeachFieldDiff[], lines: TeachLineDiff[]): { matched: number; total: number } {
  let matched = fields.filter((f) => f.kind === "MATCH").length;
  let total = fields.length;
  for (const l of lines) {
    const cells: [string, string, boolean][] = [
      [l.draftHs, l.realHs, l.draftHs === l.realHs],
      [l.draftDescription, l.realDescription, words(l.draftDescription) === words(l.realDescription)],
      [l.draftImportRate, l.realImportRate, l.draftImportRate === l.realImportRate],
      [l.draftVatRate, l.realVatRate, l.draftVatRate === l.realVatRate],
    ];
    for (const [, r, ok] of cells) {
      if (!r) continue;
      total++;
      if (ok) matched++;
    }
  }
  return { matched, total };
}
