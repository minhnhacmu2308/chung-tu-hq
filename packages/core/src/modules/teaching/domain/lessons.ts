// Bài học từ tờ khai thật (thuần): ngữ cảnh lô → quan sát (chỉ tiêu chung, câu cố định, mặt hàng) → gộp vào bài học (đếm số lần gặp, mâu thuẫn)
// → chọn bài học áp cho một hồ sơ mới. Code quyết định – không đưa bài học cho AI tự áp.
import {
  LESSON_AUTO_FILL_AFTER, lessonLineKey, type CustomsDeclarationExtraction, type CustomsDeclarationLine, type DraftLessons, type DraftLessonValue, type LessonContext,
  type LessonKind, type LessonLineValue, type LessonStatus, type TeachFieldDiff,
} from "@kb/contracts";
import { fold, numbers, realText, type DocData, type DraftField, type DraftLine } from "./compare.js";

export type LessonRow = {
  id: string; orgId: string; kind: LessonKind; fieldCode: string; contextKey: string; context: LessonContext; value: string; line: LessonLineValue | null;
  hits: number; conflicts: { value: string; hits: number }[]; status: LessonStatus; sampleIds: string[]; lastDeclarationNo: string | null; createdAt: Date; updatedAt: Date;
};

// ---------------------------------------------------------------- ngữ cảnh

const COMPANY_WORDS = new Set(["CO", "LTD", "LIMITED", "COMPANY", "CORP", "CORPORATION", "INC", "JSC", "LLC", "GMBH", "PTE", "PLC", "SA", "AG", "BV", "TNHH", "CONG", "TY", "CP", "MTV", "THE", "AND", "OF"]);
/** "ZHUHAI RISE LIGHTING CO., LTD." → "LIGHTING RISE ZHUHAI" (bỏ từ chung, sắp xếp – tên viết khác thứ tự vẫn trùng). */
export function supplierKey(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const w = [...new Set(fold(name).replace(/[^A-Z0-9]+/g, " ").split(" ").filter((x) => x.length > 1 && !COMPANY_WORDS.has(x)))].sort();
  return w.length ? w.join(" ") : undefined;
}

const CARRIERS = ["FEDEX", "DHL", "UPS", "TNT", "EMS", "ARAMEX", "SF EXPRESS", "KERRY"];
/** Hãng chuyển phát nhanh nhận ra được từ bất kỳ chứng từ nào (AWB FedEx, thông báo cước "On behalf of Fedex", C/O "FEDEX EXPRESS"). */
export function carrierOf(docs: DocData[]): string | undefined {
  const text = fold(JSON.stringify(docs.map((d) => d.data)));
  return CARRIERS.find((c) => new RegExp(`\\b${c}\\b`).test(text));
}

export function lessonContext(i: { sellerName: string | null; mode: string | null; office: string | null; docs: DocData[] }): LessonContext {
  const supplier = supplierKey(i.sellerName);
  const carrier = carrierOf(i.docs);
  return { ...(supplier ? { supplier } : {}), ...(carrier ? { carrier } : {}), ...(i.mode ? { mode: i.mode } : {}), ...(i.office ? { office: i.office } : {}) };
}

/**
 * Chỉ tiêu học theo ngữ cảnh – thứ thường KHÔNG có trên chứng từ, người khai tự biết – và ngữ cảnh quyết định giá trị:
 * kho theo chi cục + phương thức + hãng chuyển phát; phương thức thanh toán theo nhà cung cấp; cảng theo tuyến.
 */
export const LEARNABLE_FIELDS: Record<string, (keyof LessonContext)[]> = {
  KHO: ["office", "mode", "carrier"],
  CANG_DO: ["office", "mode", "carrier"],
  CANG_XEP: ["supplier", "mode"],
  PT_TT: ["supplier"],
  VBPQ: ["supplier"],
};
/** Chỉ tiêu tự do có thể chứa câu cố định lặp lại (vd câu QCVN của một mặt hàng). */
export const CLAUSE_FIELDS: Record<string, (keyof LessonContext)[]> = { CT_TG: ["supplier"], GHI_CHU: ["supplier"] };

export function pickContext(keys: (keyof LessonContext)[], c: LessonContext): { context: LessonContext; key: string } {
  const context: LessonContext = {};
  for (const k of keys) if (c[k]) context[k] = c[k];
  return { context, key: Object.entries(context).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("|") };
}

// ---------------------------------------------------------------- quan sát

export type Observation = { kind: LessonKind; fieldCode: string; contextKey: string; context: LessonContext; value: string; line: LessonLineValue | null };

const words = (s: string) => fold(s).replace(/[^A-Z0-9]+/g, " ").trim();

/** "04122024#&HĐ số … - Hàng nhập nằm ngoài phạm vi …" → các câu (bỏ tiền tố ngày DDMMYYYY#&). Chỉ tách ở " - " trước một từ viết hoa chữ đầu ("Hàng"), không tách "QĐ - BKHCN". */
export function splitClauses(text: string): string[] {
  const body = text.replace(/^\s*\d{8}#&/, "");
  return body.split(/;\s*|\s+-\s+(?=\p{Lu}\p{Ll}+\s)/u).map((x) => x.trim().replace(/[,;.\s-]+$/, "")).filter((x) => x.length >= 12);
}

/** Câu chỉ đúng cho lô này (số hóa đơn, số tiền, số chứng từ của lô) → không học. */
export function isLotSpecific(clause: string, lotIdents: string[]): boolean {
  if (/\b(HĐ|HD|INV|INVOICE|HÓA ĐƠN|HOA DON|C\/O|CO\s+SỐ|B\/L|AWB)\b/iu.test(clause)) return true;
  if (/\d[\d.,]*\s*(USD|EUR|VND|JPY|CNY|KRW)\b/i.test(clause)) return true;
  const flat = fold(clause).replace(/[^A-Z0-9]/g, "");
  return lotIdents.some((x) => x.length >= 6 && flat.includes(x));
}

/** Mã định danh của lô (số hóa đơn, vận đơn, C/O…) đọc được trên chứng từ – để nhận ra câu chỉ riêng lô này. */
export function lotIdentifiers(docs: DocData[]): string[] {
  const keys = new Set(["invoiceNo", "billNo", "awbNo", "hawbNo", "masterBillNo", "coNo", "billRef", "poNo"]);
  const out: string[] = [];
  for (const d of docs) for (const [k, v] of Object.entries(d.data)) if (keys.has(k) && typeof v === "string") out.push(fold(v).replace(/[^A-Z0-9]/g, ""));
  return out.filter(Boolean);
}

const hsDots = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d;
};

export function observe(i: {
  diffs: TeachFieldDiff[]; draft: DraftField[]; real: CustomsDeclarationExtraction; context: LessonContext; docs: DocData[];
  lines: { draft: DraftLine | null; real: CustomsDeclarationLine }[];
}): Observation[] {
  const out: Observation[] = [];
  const draftBy = new Map(i.draft.map((f) => [f.code, f]));
  for (const diff of i.diffs) {
    const keys = LEARNABLE_FIELDS[diff.code];
    if (!keys || !diff.real.trim()) continue;
    // Khớp nhờ chứng từ → không cần bài học; khớp nhờ bài học → thêm một lần gặp.
    if (diff.kind === "MATCH" && draftBy.get(diff.code)?.source !== "LESSON") continue;
    const { context, key } = pickContext(keys, i.context);
    out.push({ kind: "FIELD", fieldCode: diff.code, contextKey: key, context, value: realText(i.real, diff.code), line: null });
  }
  const idents = lotIdentifiers(i.docs);
  for (const [code, keys] of Object.entries(CLAUSE_FIELDS)) {
    const real = realText(i.real, code);
    if (!real) continue;
    const draft = words(draftBy.get(code)?.value ?? "");
    const { context, key } = pickContext(keys, i.context);
    for (const c of splitClauses(real)) {
      if (isLotSpecific(c, idents) || (draft && draft.includes(words(c)))) continue;
      out.push({ kind: "CLAUSE", fieldCode: code, contextKey: key, context, value: c, line: null });
    }
  }
  for (const { draft, real } of i.lines) {
    const k = lessonLineKey(draft?.partNo, draft?.description);
    if (!k || !real.hsCode) continue;
    const context: LessonContext = { ...(i.context.supplier ? { supplier: i.context.supplier } : {}), partNo: k };
    const ctxKey = pickContext(["supplier", "partNo"], context).key;
    out.push({
      kind: "LINE", fieldCode: "HS", contextKey: ctxKey, context, value: hsDots(real.hsCode),
      line: { hsCode: hsDots(real.hsCode), description: real.description, importRate: real.importRate, importTaxSchedule: real.importTaxSchedule, vatRate: real.vatRate, vatExemptCode: real.vatExemptCode },
    });
  }
  return out;
}

/** Cùng loại + chỉ tiêu + ngữ cảnh (+ với câu cố định: cùng câu) là một bài học. */
export const lessonIdentity = (o: Pick<Observation, "kind" | "fieldCode" | "contextKey" | "value">) =>
  `${o.kind}|${o.fieldCode}|${o.contextKey}${o.kind === "CLAUSE" ? `|${words(o.value)}` : ""}`;

const sameLessonValue = (kind: LessonKind, a: string, b: string) => (kind === "LINE" ? a.replace(/\D/g, "") === b.replace(/\D/g, "") : words(a) === words(b));

/**
 * Gộp một lần gặp vào bài học. Cùng giá trị → +1 lần; khác giá trị → ghi mâu thuẫn, giá trị gặp nhiều hơn thắng.
 * Một tờ khai chỉ tính một lần (đọc lại không cộng thêm). Bài học đang dùng mà gặp mâu thuẫn → về chờ duyệt.
 */
export function applyObservation(existing: LessonRow | null, o: Observation, sample: { id: string; declarationNo: string | null }, base: { id: string; orgId: string; now: Date }): LessonRow {
  if (!existing) {
    return {
      id: base.id, orgId: base.orgId, kind: o.kind, fieldCode: o.fieldCode, contextKey: o.contextKey, context: o.context, value: o.value, line: o.line,
      hits: 1, conflicts: [], status: "PENDING", sampleIds: [sample.id], lastDeclarationNo: sample.declarationNo, createdAt: base.now, updatedAt: base.now,
    };
  }
  if (existing.sampleIds.includes(sample.id)) return existing;
  const next: LessonRow = { ...existing, sampleIds: [...existing.sampleIds, sample.id], lastDeclarationNo: sample.declarationNo ?? existing.lastDeclarationNo, updatedAt: base.now };
  if (sameLessonValue(o.kind, existing.value, o.value)) return { ...next, hits: existing.hits + 1, line: o.line ?? existing.line };
  const conflicts = [...existing.conflicts];
  const at = conflicts.findIndex((c) => sameLessonValue(o.kind, c.value, o.value));
  if (at >= 0) conflicts[at] = { value: conflicts[at]!.value, hits: conflicts[at]!.hits + 1 };
  else conflicts.push({ value: o.value, hits: 1 });
  const top = conflicts.reduce((a, c) => (c.hits > a.hits ? c : a), conflicts[0]!);
  const status: LessonStatus = existing.status === "ACTIVE" ? "PENDING" : existing.status;
  if (top.hits > existing.hits) {
    return { ...next, value: top.value, hits: top.hits, line: o.line ?? existing.line, conflicts: [...conflicts.filter((c) => c !== top), { value: existing.value, hits: existing.hits }], status };
  }
  return { ...next, conflicts, status };
}

export const isAutoFill = (r: Pick<LessonRow, "status" | "hits" | "conflicts">) => r.status === "ACTIVE" && r.hits >= LESSON_AUTO_FILL_AFTER && r.conflicts.length === 0;

/** Bài học có áp cho ngữ cảnh này không: mọi khóa ngữ cảnh của bài học đều trùng. */
const fits = (lc: LessonContext, c: LessonContext) => (Object.entries(lc) as [keyof LessonContext, string][]).every(([k, v]) => c[k] === v);

const draftValue = (r: LessonRow): DraftLessonValue => ({
  lessonId: r.id, value: r.value, hits: r.hits, autoFill: isAutoFill(r), conflicts: r.conflicts.map((c) => c.value), declarationNo: r.lastDeclarationNo,
});

/** Bài học đang dùng áp cho một hồ sơ: mỗi chỉ tiêu lấy bài học khớp ngữ cảnh cụ thể nhất (nhiều khóa nhất), rồi gặp nhiều nhất. */
export function lessonsForDraft(rows: LessonRow[], c: LessonContext): DraftLessons {
  const active = rows.filter((r) => r.status === "ACTIVE");
  const fields: DraftLessons["fields"] = {};
  for (const code of Object.keys(LEARNABLE_FIELDS)) {
    const best = active
      .filter((r) => r.kind === "FIELD" && r.fieldCode === code && fits(r.context, c))
      .sort((a, b) => Object.keys(b.context).length - Object.keys(a.context).length || b.hits - a.hits)[0];
    if (best) fields[code] = draftValue(best);
  }
  const clauses: DraftLessons["clauses"] = {};
  for (const r of active.filter((x) => x.kind === "CLAUSE" && fits(x.context, c))) (clauses[r.fieldCode] ??= []).push(draftValue(r));
  const lines = active
    .filter((r) => r.kind === "LINE" && r.line && (!r.context.supplier || r.context.supplier === c.supplier))
    .map((r) => ({ ...draftValue(r), key: r.context.partNo ?? "", line: r.line! }));
  return { fields, clauses, lines };
}

/** Số tiền trong câu (để kiểm câu có phải số liệu riêng lô) – xuất cho test. */
export const amountsIn = numbers;
