// Ảnh chụp nội dung đã gửi từng tờ khai nhánh (spec tách tờ khai IDC/gọi về §2.5) – THUẦN, dùng chung backend (raw.sent của kết quả tờ) và mock.
// Tờ còn hiệu lực ở Hải quan (chưa gọi về) mà chỉ tiêu chung / dòng hàng hiện tại khác nội dung đã gửi → chặn duyệt và truyền (SENT_SHEETS_CHANGED).
import { z } from "zod";
import type { CustomsStage } from "./customs-flow.js";
import { awaitingContent, recallExempt } from "./customs-summary.js";
import { appFieldMeta, extraFieldMeta } from "./declaration-layout/index.js";

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
  for (const [code, value] of Object.entries(p.fields)) if (!PER_SHEET.has(code) && !code.startsWith(ITEM_PREFIX)) common[code] = value;
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
  const keys = [...new Set([...Object.keys(now.common), ...Object.keys(sent.common)])];
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

/** Chữ tiếng Việt của tham số `fields` khi chỉ dòng hàng đổi (giao diện dịch theo `linesOnly`). */
export const SENT_LINES_ONLY_VI = "dòng hàng";

/**
 * Tham số lý do SENT_SHEETS_CHANGED: `sheets` – tờ đổi + tờ không kiểm được (tăng dần); `fields` – số chỉ tiêu chung đã đổi (sắp theo số),
 * hoặc "dòng hàng" khi không chỉ tiêu chung nào đổi (`linesOnly` = "1"). Không có gì → null.
 */
export function sentSheetsReason(kind: "IDA" | "EDA", c: SentSheetsCheck): { sheets: string; fields: string; linesOnly: "0" | "1" } | null {
  const nos = [...new Set([...c.changed.map((x) => x.no), ...c.unverified])].sort((a, b) => a - b);
  if (!nos.length) return null;
  const numbers = [...new Set(c.changed.flatMap((x) => x.common).map((code) => declarationFieldNo(kind, code)))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return { sheets: nos.join(", "), fields: numbers.length ? numbers.join(", ") : SENT_LINES_ONLY_VI, linesOnly: numbers.length ? "0" : "1" };
}
