import { CATALOG_EDA } from "../declaration/catalog-eda.js";
import { CATALOG_IDA } from "../declaration/catalog-ida.js";
import { HYS_REQUEST_ROWS, type HysProcedureCode } from "../fpt/hys.js";

/** Luật thuần HYS (hồ sơ đính kèm điện tử): kiểm bộ file, điền cặp 1.63/2.53, gợi ý G1–G5. */

export const HYS_ALLOWED_EXTENSIONS: readonly string[] = [
  "txt", "doc", "docx", "docm", "xml", "xls", "xlsx", "xlsm", "csv",
  "jpg", "jpeg", "gif", "tif", "tiff", "bmp", "pdf", "htm", "html",
];
export const HYS_MAX_TOTAL_BYTES = 2_097_152;
export const HYS_MAX_SLOTS = 3;

export type HysIssue = {
  code: "NO_FILE" | "BAD_EXTENSION" | "TOO_LARGE" | "MISSING_PROCEDURE" | "MISSING_OFFICE" | "MISSING_UNIT" | "TOO_LONG";
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
  if (blank(s.processingUnit)) issues.push({ code: "MISSING_UNIT" });
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

/** Điền (mã thủ tục, số tiếp nhận) vào cặp 1.63/2.53 còn trống đầu tiên; đã có số này thì không điền lại. */
export function fillAttachmentSlot(
  values: AttachmentValues,
  procedureCode: string,
  receiptNo: string,
): { outcome: "FILLED" | "ALREADY" | "FULL"; slot?: 1 | 2 | 3; set?: Record<string, string> } {
  const slots = [1, 2, 3] as const;
  const receipt = receiptNo.trim();
  for (const n of slots) {
    if ((values[`TK_EB${n}`] ?? "").trim() === receipt) return { outcome: "ALREADY", slot: n };
  }
  for (const n of slots) {
    if (blank(values[`TK_EB${n}`])) {
      return { outcome: "FILLED", slot: n, set: { [`TK_EA${n}`]: procedureCode, [`TK_EB${n}`]: receipt } };
    }
  }
  return { outcome: "FULL" };
}

export const VALUATION_CODES_WITHOUT_A01 = ["6", "7"] as const;

export type HysRule = "G1" | "G2" | "G3" | "G4" | "G5";
export type HysSuggestion = { code: HysProcedureCode; rule: HysRule; fieldNo: string };

const firstToken = (v: string): string => v.split(/\s*[–-]\s*/)[0]!.trim();
const val = (values: Record<string, string>, key: string): string => (values[key] ?? "").trim();
const noteMaxLen = (kind: "IDA" | "EDA"): number => {
  const no = kind === "IDA" ? "1.68" : "2.57";
  return (kind === "IDA" ? CATALOG_IDA : CATALOG_EDA).find((d) => d.no === no)?.maxLen ?? Number.POSITIVE_INFINITY;
};

export function suggestHys(input: {
  kind: "IDA" | "EDA";
  values: Record<string, string>;
  containerCount: number;
  satisfied: ReadonlySet<string>;
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
    if (satisfied.has(s.code) || seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  });
}

/** Mã đã khai: có bộ HYS đang gửi/đã nhận ∪ cặp 1.63/2.53 đã có số tiếp nhận. */
export function satisfiedHysCodes(
  values: AttachmentValues,
  submissions: { procedureCode: string; status: string }[],
): Set<string> {
  const out = new Set<string>();
  for (const s of submissions) if (s.status === "SENDING" || s.status === "ACCEPTED") out.add(s.procedureCode);
  for (const n of [1, 2, 3] as const) {
    const code = (values[`TK_EA${n}`] ?? "").trim();
    if (code !== "" && !blank(values[`TK_EB${n}`])) out.add(code);
  }
  return out;
}
