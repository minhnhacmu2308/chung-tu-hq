// Ảnh chụp nội dung đã gửi từng tờ khai nhánh (spec tách tờ khai IDC/gọi về §2.5) – THUẦN, dùng chung backend (raw.sent của kết quả tờ) và mock.
// Tờ còn hiệu lực ở Hải quan (chưa gọi về) mà chỉ tiêu chung / dòng hàng hiện tại khác nội dung đã gửi → chặn duyệt và truyền (SENT_SHEETS_CHANGED).
import { z } from "zod";
import type { CustomsStage } from "./customs-flow.js";
import { awaitingContent, recallExempt } from "./customs-summary.js";
import { appFieldMeta, extraFieldMeta } from "./declaration-layout/index.js";
import { fillReason, type ReasonCode } from "./reason-codes.js";

/** `common`: chỉ tiêu chung đã gửi (mã → giá trị, cộng `@ADJ`/`@CONT`/`@CUR`); `lines`: JSON ổn định các dòng hàng của tờ (kèm ô HANG.<id>.*). */
export const SentSnapshotSchema = z.object({ common: z.record(z.string(), z.string()), lines: z.string() });
export type SentSnapshot = z.infer<typeof SentSnapshotSchema>;

/** JSON với khóa object sắp xếp (mảng giữ thứ tự) – cùng nội dung cho cùng chuỗi bất kể thứ tự khóa. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  );
}

/** Chỉ tiêu riêng từng tờ (1.2: số tờ khai đầu tiên, số nhánh) – khác nhau giữa các tờ, không thuộc nội dung chung. */
const PER_SHEET = new Set(["TK_FIC", "TK_BNO"]);
/**
 * Chỉ tiêu hệ thống tự tính theo đồng hồ mỗi lần dựng tờ khai (không từ chứng từ / mặc định / người khai) – không so: dựng lại hôm sau tự đổi,
 * Hải quan tự ghi ngày đăng ký của mình. Đã rà mapping IDA/EDA: chỉ NGAY_DK (1.11/2.10, vnDate(now)). Tỷ giá KHÔNG thuộc đây (đổi tuần → RATE_WEEK_CHANGED).
 */
export const SNAPSHOT_VOLATILE_FIELDS: readonly string[] = ["NGAY_DK"];
const VOLATILE = new Set(SNAPSHOT_VOLATILE_FIELDS);
const ITEM_PREFIX = "HANG.";

/** Nội dung một tờ khai nhánh như được gửi: `fields` đã gồm chỉ tiêu tính cho tờ (TK_DNO, TK_TP…), `items` = dòng hàng của tờ. */
export type SentSheetInput = {
  fields: Record<string, string>;
  items: ({ id?: string | undefined; lineNo: number } & Record<string, unknown>)[];
  adjustments: unknown;
  containers: unknown;
  currency: string;
};

export function sentSnapshotOf(p: SentSheetInput): SentSnapshot {
  const common: Record<string, string> = {};
  for (const [code, value] of Object.entries(p.fields)) if (!PER_SHEET.has(code) && !VOLATILE.has(code) && !code.startsWith(ITEM_PREFIX)) common[code] = value;
  common["@ADJ"] = stableJson(p.adjustments);
  common["@CONT"] = stableJson(p.containers);
  common["@CUR"] = p.currency;
  const lines = [...p.items]
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((item) => {
      const prefix = item.id ? `${ITEM_PREFIX}${item.id}.` : null;
      return { item, fields: prefix ? Object.fromEntries(Object.entries(p.fields).filter(([code]) => code.startsWith(prefix))) : {} };
    });
  return { common, lines: stableJson(lines) };
}

/** Mã chỉ tiêu chung khác nhau (ô vắng = ô rỗng) và dòng hàng có khác không. */
export function sentSnapshotDiff(now: SentSnapshot, sent: SentSnapshot): { common: string[]; lines: boolean } {
  const keys = [...new Set([...Object.keys(now.common), ...Object.keys(sent.common)])].filter((k) => !VOLATILE.has(k));
  return { common: keys.filter((k) => (now.common[k] ?? "") !== (sent.common[k] ?? "")).sort(), lines: now.lines !== sent.lines };
}

/** Tờ còn hiệu lực ở Hải quan: đã có số, chưa gọi về (không chờ gửi nội dung), không miễn (thông quan / từ chối – R7). */
export const isActiveSheet = (s: { stage: CustomsStage; declarationNo: string | null }) => !!s.declarationNo && !recallExempt(s.stage) && !awaitingContent(s.stage);

export type SentSheetsCheck = {
  /** Tờ còn hiệu lực có ảnh chụp mà nội dung hiện tại khác. */
  changed: { no: number; common: string[]; lines: boolean }[];
  /** Tờ còn hiệu lực KHÔNG có ảnh chụp (gửi trước khi có tính năng) – không kiểm được, coi như đã đổi (phải gọi về). */
  unverified: number[];
};

export function sentSheetsCheck(sheets: { no: number; stage: CustomsStage; declarationNo: string | null; sent: SentSnapshot | null; current: SentSnapshot }[]): SentSheetsCheck {
  const out: SentSheetsCheck = { changed: [], unverified: [] };
  for (const s of sheets) {
    if (!isActiveSheet(s)) continue;
    if (!s.sent) {
      out.unverified.push(s.no);
      continue;
    }
    const d = sentSnapshotDiff(s.current, s.sent);
    if (d.common.length || d.lines) out.changed.push({ no: s.no, ...d });
  }
  return out;
}

/** Khóa đặc biệt của ảnh chụp → số chỉ tiêu (khoản điều chỉnh 1.49 tờ khai nhập; số container 2.60 tờ khai xuất). */
const SPECIAL_NO: Record<string, Partial<Record<"IDA" | "EDA", string>>> = { "@ADJ": { IDA: "1.49" }, "@CONT": { EDA: "2.60" } };

/** Số chỉ tiêu của mã (catalog bố cục tờ khai); không tra được → giữ mã. */
export function declarationFieldNo(kind: "IDA" | "EDA", code: string): string {
  return SPECIAL_NO[code]?.[kind] ?? appFieldMeta(kind, code)?.no ?? extraFieldMeta(kind, code)?.no ?? code;
}

/** Nhãn ghép tham số `fields` của SENT_SHEETS_CHANGED (bản vi; giao diện truyền nhãn theo ngôn ngữ). */
export const SENT_FIELDS_VI = { lines: "dòng hàng", linesOf: "dòng hàng tờ {sheets}" };

/**
 * Chữ `fields`: số chỉ tiêu chung đã đổi; đổi cả dòng hàng → thêm "dòng hàng tờ n"; chỉ dòng hàng → "dòng hàng" (tờ đã nêu ở {sheets}).
 * Backend ghép bản vi; giao diện ghép lại theo ngôn ngữ từ `numbers` + `lineSheets`.
 */
export function sentFieldsText(numbers: string, lineSheets: string, labels: { lines: string; linesOf: string } = SENT_FIELDS_VI): string {
  if (!numbers) return labels.lines;
  return lineSheets ? `${numbers}; ${fillReason(labels.linesOf, { sheets: lineSheets })}` : numbers;
}

export type SentSheetsReason =
  | { reason: Extract<ReasonCode, "SENT_SHEETS_UNVERIFIED">; params: { sheets: string } }
  | { reason: Extract<ReasonCode, "SENT_SHEETS_CHANGED">; params: { sheets: string; fields: string; numbers: string; lineSheets: string; linesOnly: "0" | "1" } };

/**
 * Lý do chặn: còn tờ còn hiệu lực không có ảnh chụp (khai trước khi có tính năng) → SENT_SHEETS_UNVERIFIED nêu các tờ đó (ưu tiên – phải gọi về,
 * không kiểm được); không thì tờ có nội dung đổi → SENT_SHEETS_CHANGED: `sheets` (tăng dần), `numbers` – số chỉ tiêu chung đã đổi (sắp theo số),
 * `lineSheets` – tờ có dòng hàng đổi, `fields` – chữ vi ghép (sentFieldsText), `linesOnly` = "1" khi không chỉ tiêu chung nào đổi. Không có gì → null.
 */
export function sentSheetsReason(kind: "IDA" | "EDA", c: SentSheetsCheck): SentSheetsReason | null {
  if (c.unverified.length) return { reason: "SENT_SHEETS_UNVERIFIED", params: { sheets: [...c.unverified].sort((a, b) => a - b).join(", ") } };
  if (!c.changed.length) return null;
  const nos = [...new Set(c.changed.map((x) => x.no))].sort((a, b) => a - b);
  const numbers = [...new Set(c.changed.flatMap((x) => x.common).map((code) => declarationFieldNo(kind, code)))].sort((a, b) => a.localeCompare(b, "en", { numeric: true })).join(", ");
  const lineSheets = c.changed.filter((x) => x.lines).map((x) => x.no).sort((a, b) => a - b).join(", ");
  return { reason: "SENT_SHEETS_CHANGED", params: { sheets: nos.join(", "), fields: sentFieldsText(numbers, lineSheets), numbers, lineSheets, linesOnly: numbers ? "0" : "1" } };
}
