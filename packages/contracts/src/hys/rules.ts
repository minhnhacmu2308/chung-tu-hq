import type { DocKind } from "../common.js";
import { CATALOG_EDA } from "../declaration/catalog-eda.js";
import { CATALOG_IDA } from "../declaration/catalog-ida.js";
import type { AttachKind } from "../declaration/code-tables.js";
import { HYS_REQUEST_ROWS, type HysProcedureCode } from "../fpt/hys.js";

/** Luật thuần HYS (hồ sơ đính kèm điện tử): kiểm bộ file, điền cặp 1.63/2.53, gợi ý G1–G5. */

export const HYS_ALLOWED_EXTENSIONS: readonly string[] = [
  "txt", "doc", "docx", "docm", "xml", "xls", "xlsx", "xlsm", "csv",
  "jpg", "jpeg", "gif", "tif", "tiff", "bmp", "pdf", "htm", "html",
];
export const HYS_MAX_TOTAL_BYTES = 2_097_152;
export const HYS_MAX_SLOTS = 3;

export type HysIssue = {
  code: "NO_FILE" | "BAD_EXTENSION" | "TOO_LARGE" | "MISSING_PROCEDURE" | "MISSING_OFFICE" | "TOO_LONG";
  file?: string;
  field?: string;
  bytes?: number;
};

export function hysExtensionAllowed(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return false;
  return HYS_ALLOWED_EXTENSIONS.includes(fileName.slice(dot + 1).trim().toLowerCase());
}

const requestLen = (key: string): number => {
  const row = HYS_REQUEST_ROWS.find((r) => r[0] === key);
  return row ? Number(row[2]) : Number.POSITIVE_INFINITY;
};

const blank = (v: string | null | undefined): boolean => v == null || v.trim() === "";

export type HysSubmissionInput = {
  procedureCode: string | null;
  customsOffice: string | null;
  processingUnit: string | null;
  phone: string | null;
  internalRef: string | null;
  note: string | null;
  files: { fileName: string; sizeBytes: number }[];
};

export function checkHysSubmission(s: HysSubmissionInput): HysIssue[] {
  const issues: HysIssue[] = [];
  if (s.files.length === 0) issues.push({ code: "NO_FILE" });
  for (const f of s.files) {
    if (!hysExtensionAllowed(f.fileName)) issues.push({ code: "BAD_EXTENSION", file: f.fileName });
  }
  const total = s.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  if (total > HYS_MAX_TOTAL_BYTES) issues.push({ code: "TOO_LARGE", bytes: total });
  if (blank(s.procedureCode)) issues.push({ code: "MISSING_PROCEDURE" });
  if (blank(s.customsOffice)) issues.push({ code: "MISSING_OFFICE" });
  const lengths: [string, string | null][] = [
    ["TK_STL", s.phone],
    ["TK_REF", s.internalRef],
    ["TK_KJJ", s.note],
  ];
  for (const [field, value] of lengths) {
    if (value != null && value.length > requestLen(field)) issues.push({ code: "TOO_LONG", field });
  }
  return issues;
}

export type AttachmentValues = Partial<Record<"TK_EA1" | "TK_EA2" | "TK_EA3" | "TK_EB1" | "TK_EB2" | "TK_EB3", string>>;

/** Mã đầu chuỗi: "INV – Hóa đơn" → "INV". */
const firstToken = (v: string): string => v.split(/\s*[–-]\s*/)[0]!.trim();

export type AttachmentSlot = 1 | 2 | 3;
export type AttachmentPair = { slot: AttachmentSlot; code: string; receipt: string };

/** Các cặp 1.63/2.53 đang có số tiếp nhận (TK_EB{n} khác rỗng – HYS điền hoặc nhập tay), theo thứ tự cặp; mã phân loại đính kèm chuẩn hóa ("INV – …" → "INV"). */
export function attachmentPairs(values: AttachmentValues): AttachmentPair[] {
  const out: AttachmentPair[] = [];
  for (const n of [1, 2, 3] as const) {
    if (blank(values[`TK_EB${n}`])) continue;
    out.push({ slot: n, code: firstToken(values[`TK_EA${n}`] ?? ""), receipt: (values[`TK_EB${n}`] ?? "").trim() });
  }
  return out;
}

/**
 * Điền (phân loại đính kèm TK_EA, số tiếp nhận TK_EB) vào cặp 1.63/2.53 còn trống đầu tiên; đã có số này thì không điền lại.
 * Hết cặp trống: có `replaceSlot` (người khai đã chọn) → thay cặp đó (REPLACED, kèm giá trị cũ); không có → FULL.
 */
export function fillAttachmentSlot(
  values: AttachmentValues,
  attachKind: string,
  receiptNo: string,
  replaceSlot?: AttachmentSlot,
): {
  outcome: "FILLED" | "ALREADY" | "FULL" | "REPLACED";
  slot?: AttachmentSlot;
  set?: Record<string, string>;
  replaced?: { code: string; receipt: string };
} {
  const slots = [1, 2, 3] as const;
  const receipt = receiptNo.trim();
  for (const n of slots) {
    if ((values[`TK_EB${n}`] ?? "").trim() === receipt) return { outcome: "ALREADY", slot: n };
  }
  for (const n of slots) {
    if (blank(values[`TK_EB${n}`])) {
      return { outcome: "FILLED", slot: n, set: { [`TK_EA${n}`]: attachKind, [`TK_EB${n}`]: receipt } };
    }
  }
  if (replaceSlot !== undefined) {
    const n = replaceSlot;
    return {
      outcome: "REPLACED",
      slot: n,
      set: { [`TK_EA${n}`]: attachKind, [`TK_EB${n}`]: receipt },
      replaced: { code: firstToken(values[`TK_EA${n}`] ?? ""), receipt: (values[`TK_EB${n}`] ?? "").trim() },
    };
  }
  return { outcome: "FULL" };
}

export const VALUATION_CODES_WITHOUT_A01 = ["6", "7"] as const;

export type HysRule = "G1" | "G2" | "G3" | "G4" | "G5";
export type HysSuggestion = { code: HysProcedureCode; rule: HysRule; fieldNo: string };

const val = (values: Record<string, string>, key: string): string => (values[key] ?? "").trim();
const noteMaxLen = (kind: "IDA" | "EDA"): number => {
  const no = kind === "IDA" ? "1.68" : "2.57";
  return (kind === "IDA" ? CATALOG_IDA : CATALOG_EDA).find((d) => d.no === no)?.maxLen ?? Number.POSITIVE_INFINITY;
};

/**
 * Gợi ý đã được thỏa: `codes` – mã thủ tục đã khai bằng bộ HYS (tắt mọi rule của mã); `rules` – rule thỏa nhờ cặp 1.63/2.53 nhập tay
 * (INV → G2, ALL → mọi rule). Một mã do nhiều rule sinh ra (A99: G2, G5) chỉ tắt khi mọi rule sinh ra nó đều thỏa.
 */
export type HysSatisfaction = { codes: ReadonlySet<string>; rules: ReadonlySet<HysRule> };

export function suggestHys(input: {
  kind: "IDA" | "EDA";
  values: Record<string, string>;
  containerCount: number;
  satisfied: HysSatisfaction;
}): HysSuggestion[] {
  const { kind, values, containerCount, satisfied } = input;
  const ida = kind === "IDA";
  const all: HysSuggestion[] = [];

  const g1 = ida ? Number(val(values, "VD_COC")) > 0 || containerCount > 0 : containerCount > 50;
  if (g1) all.push({ code: "A02", rule: "G1", fieldNo: ida ? "1.35" : "2.60" });

  if (firstToken(val(values, "TK_IV1")) === "B") all.push({ code: "A99", rule: "G2", fieldNo: ida ? "1.39" : "2.34" });

  if (ida) {
    const method = firstToken(val(values, "KTG_VD1"));
    if (method !== "" && !(VALUATION_CODES_WITHOUT_A01 as readonly string[]).includes(method)) {
      all.push({ code: "A01", rule: "G3", fieldNo: "1.45" });
    } else if (firstToken(val(values, "KTG_FR1")) === "D") {
      all.push({ code: "A01", rule: "G3", fieldNo: "1.47" });
    }
  }

  if (firstToken(val(values, "TK_ENC")) === "A") all.push({ code: "A08", rule: "G4", fieldNo: ida ? "1.58" : "2.48" });

  if (val(values, "TK_NT2").length > noteMaxLen(kind)) {
    all.push({ code: "A99", rule: "G5", fieldNo: ida ? "1.68" : "2.57" });
  }

  const seen = new Set<string>();
  return all.filter((s) => {
    if (satisfied.codes.has(s.code) || satisfied.rules.has(s.rule) || seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  });
}

const ALL_RULES: readonly HysRule[] = ["G1", "G2", "G3", "G4", "G5"];

/**
 * Đã khai (spec §3.3):
 * - bộ HYS ACCEPTED có số tiếp nhận đang nằm trong TK_EB1..3 → đã khai mã thủ tục của bộ (bộ bị thay cặp – số không còn – không tính);
 * - cặp nhập tay (TK_EB có số không thuộc bộ HYS nào của hồ sơ) chỉ tính khi khớp rõ: TK_EA = INV → G2 (nhiều hóa đơn, A99);
 *   ALL → mọi gợi ý. Phân loại khác → không thỏa (vẫn nhắc, người khai có thể "Vẫn khai").
 */
export function hysSatisfaction(
  values: AttachmentValues,
  submissions: { procedureCode: string | null; status: string; receiptNo: string | null }[],
): HysSatisfaction {
  const codes = new Set<string>();
  const rules = new Set<HysRule>();
  const pairs = attachmentPairs(values);
  const inSlots = new Set(pairs.map((p) => p.receipt));
  const ofSubmissions = new Set(submissions.flatMap((s) => (s.receiptNo ? [s.receiptNo.trim()] : [])));
  for (const s of submissions) {
    if (s.status === "ACCEPTED" && s.procedureCode && s.receiptNo != null && inSlots.has(s.receiptNo.trim())) codes.add(s.procedureCode);
  }
  for (const p of pairs) {
    if (ofSubmissions.has(p.receipt)) continue;
    if (p.code === "INV") rules.add("G2");
    if (p.code === "ALL") for (const r of ALL_RULES) rules.add(r);
  }
  return { codes, rules };
}

const ATTACH_KIND_OF_DOC: Record<DocKind, AttachKind> = {
  INVOICE: "INV",
  FREIGHT_INVOICE: "INV",
  BILL_OF_LADING: "BOL",
  AIR_WAYBILL: "AWB",
  SALES_CONTRACT: "CON",
  PACKING_LIST: "ETC",
  CERT_OF_ORIGIN: "ETC",
  ARRIVAL_NOTICE: "ETC",
  OTHER: "ETC",
};

/** Phân loại đính kèm (1.63/2.53 ô 1) của một loại chứng từ hồ sơ. INS, DM không suy ra được từ chứng từ – người khai tự chọn. */
export function attachKindOfDoc(kind: DocKind): AttachKind {
  return ATTACH_KIND_OF_DOC[kind];
}

/** Đề xuất phân loại đính kèm theo chứng từ hồ sơ đã chọn trong bộ: không có (chỉ file tải riêng) → ETC; một mã → mã đó; ≥ 2 mã → ALL. */
export function suggestAttachKind(docKinds: readonly DocKind[]): AttachKind {
  const kinds = new Set(docKinds.map(attachKindOfDoc));
  if (kinds.size === 0) return "ETC";
  if (kinds.size === 1) return [...kinds][0]!;
  return "ALL";
}
