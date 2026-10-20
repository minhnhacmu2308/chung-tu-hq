// Logic thuần của bước 7 "Sửa sau thông quan": bước nhỏ hiện tại, ô đã đổi, hạn 60 ngày (TT121 Điều 20), lý do chưa duyệt được, nút chính.
// Tách khỏi màn hình để test bằng vitest (apps/web chỉ chạy test .ts trong môi trường node).
import {
  addDec, AMA_IMPORT_TAX_COLUMNS, AMA_OTHER_TAX_SLOTS, amaLineDelta, amaOtherTaxColumns, DEC_ZERO, formatDec, parseDec,
  type CustomsOperation, type CustomsStage, type PostAmendment, type PostAmendmentLine, type PostAmendmentValues,
} from "@kb/contracts";

export type AmaSubStep = "pick" | "edit" | "reason" | "declare";
export const AMA_SUB_STEPS: readonly { id: AmaSubStep; label: string }[] = [
  { id: "pick", label: "Chọn dòng" },
  { id: "edit", label: "Sửa nội dung" },
  { id: "reason", label: "Lý do & phê duyệt" },
  { id: "declare", label: "Khai Hải quan" },
];
const ORDER = AMA_SUB_STEPS.map((s) => s.id);

/** Bước 7 chỉ có khi tờ khai đã thông quan hoặc đang sửa sau thông quan. */
export const postStepVisible = (stage: CustomsStage | undefined) => stage === "CLEARED" || Boolean(stage?.startsWith("POST_"));

export function defaultSubStep(a: PostAmendment): AmaSubStep {
  switch (a.status) {
    case "DRAFT": return a.lines.length ? "edit" : "pick";
    case "RECALLED": return "edit";
    default: return "declare";
  }
}

/** `?sub=` hợp lệ và không vượt bước mặc định thì xem; ngược lại về bước mặc định. */
export function resolveSubStep(a: PostAmendment, requested: string | null): AmaSubStep {
  const def = defaultSubStep(a);
  const i = ORDER.indexOf(requested as AmaSubStep);
  return i >= 0 && i <= ORDER.indexOf(def) ? ORDER[i]! : def;
}

export const subStepEditable = (a: PostAmendment, s: AmaSubStep, canEdit: boolean) =>
  canEdit && s !== "declare" && (a.status === "DRAFT" || a.status === "RECALLED" || a.status === "APPROVED");

// ---------------------------------------------------------------- so sánh Trước | Sau

export type CompareRow = { label: string; before: string; after: string; computed?: boolean };

const IMPORT_LABEL: Record<string, string> = { HAG_MKA: "Tiền thuế NK/XK" };
export const IMPORT_COMPARE_ROWS: CompareRow[] = AMA_IMPORT_TAX_COLUMNS.map((c) => ({
  label: IMPORT_LABEL[c.before] ?? c.label,
  before: c.before,
  after: c.after,
  ...(c.after === "HAG_AKA" ? { computed: true } : {}),
}));
export const otherCompareRows = (n: number): CompareRow[] =>
  amaOtherTaxColumns(n).map((c) => ({ label: c.label, before: c.before, after: c.after, ...(c.after === `HAG_AA${n}` ? { computed: true } : {}) }));

/** Nhóm thu khác (1–5) đang có giá trị Trước hoặc Sau. */
export const otherSlotsInUse = (values: PostAmendmentValues): number[] =>
  AMA_OTHER_TAX_SLOTS.filter((n) => amaOtherTaxColumns(n).some((c) => values[c.before]?.trim() || values[c.after]?.trim()));

/** Cặp Trước → Sau ngoài khối thuế: mô tả, xuất xứ, mã hàng nội bộ. */
const TEXT_PAIRS: [string, string][] = [["HAG_CMB", "HAG_CMA"], ["HAG_ORB", "HAG_ORA"], ["APP_MA_HANG_TRUOC", "APP_MA_HANG_SAU"]];
const ALL_PAIRS: [string, string][] = [
  ...TEXT_PAIRS,
  ...AMA_IMPORT_TAX_COLUMNS.map((c): [string, string] => [c.before, c.after]),
  ...AMA_OTHER_TAX_SLOTS.flatMap((n) => amaOtherTaxColumns(n).map((c): [string, string] => [c.before, c.after])),
];

function same(a: string | undefined, b: string | undefined): boolean {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  const dx = parseDec(x);
  const dy = parseDec(y);
  return dx && dy ? formatDec(dx) === formatDec(dy) : x === y;
}

/** Khóa "Sau" khác "Trước" tương ứng (số so theo giá trị: "120000" = "120000.00"). */
export const changedKeys = (line: PostAmendmentLine): string[] =>
  ALL_PAIRS.filter(([b, a]) => !same(line.values[b], line.values[a])).map(([, a]) => a);

// ---------------------------------------------------------------- hạn, tóm tắt, chặn duyệt, nút chính

const DAY = 86_400_000;
const parseIso = (s: string | undefined): number | null => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? null : t;
};

/** Hạn khai bổ sung = ngày thông quan (`TK_IPD`) + 60 ngày. */
export function amaDeadline(ipd: string | undefined, today: string): { due: string; daysLeft: number; overdue: boolean } | null {
  const start = parseIso(ipd);
  const now = parseIso(today);
  if (start === null || now === null) return null;
  const due = start + 60 * DAY;
  const daysLeft = Math.round((due - now) / DAY);
  return { due: new Date(due).toISOString().slice(0, 10), daysLeft, overdue: daysLeft < 0 };
}

export function amaChangeSummary(a: PostAmendment): { lines: number; changed: number; taxDelta: string } {
  let tax = DEC_ZERO;
  let changed = 0;
  for (const l of a.lines) {
    changed += changedKeys(l).length;
    const d = amaLineDelta(l.values);
    for (const x of [d.importTax, ...d.other.map((o) => o.amount)]) tax = addDec(tax, parseDec(x) ?? DEC_ZERO);
  }
  return { lines: a.lines.length, changed, taxDelta: formatDec(tax) };
}

export function approveBlockers(a: PostAmendment, o: { pendingEdits: number; fourEyes: boolean }): string[] {
  return [
    !a.lines.length && "Chưa có dòng hàng",
    !a.header["TK_REC"]?.trim() && "Chưa nhập mã lý do khai bổ sung",
    o.pendingEdits > 0 && "Còn thay đổi chưa lưu",
    o.fourEyes && "Nguyên tắc 4 mắt: nhờ Người duyệt khác phê duyệt",
  ].filter((x): x is string => Boolean(x));
}

export function amaPrimaryAction(a: PostAmendment, o: { stage: CustomsStage; sending: boolean }): { op: "AMA" | "AMC"; label: string } | null {
  if (o.sending) return null;
  if (a.status === "APPROVED" && (o.stage === "POST_EDITING" || o.stage === "POST_RECALLED")) return { op: "AMA", label: "Ký số & khai tạm AMA" };
  if (a.status === "PRE_DECLARED" && o.stage === "POST_PRE_DECLARED") return { op: "AMC", label: "Khai chính thức AMC" };
  return null;
}

/** Nghiệp vụ của bản khai bổ sung – làm ở bước 7, bước 6 không hiện. */
export const AMA_OPS: ReadonlySet<CustomsOperation> = new Set<CustomsOperation>(["AMA", "AMB", "AMC"]);
