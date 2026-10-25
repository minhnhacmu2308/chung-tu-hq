// Logic thuần của bước 7 "Sửa sau thông quan": bước nhỏ hiện tại, ô đã đổi, hạn 60 ngày (TT121 Điều 20), lý do chưa duyệt được, nút chính.
// Tách khỏi màn hình để test bằng vitest (apps/web chỉ chạy test .ts trong môi trường node).
import {
  addDec, AMA_HEADER_LAYOUT, AMA_IMPORT_TAX_COLUMNS, AMA_OTHER_TAX_SLOTS, amaHeaderLocked, amaLineDelta, applyAmaLineEdit, amaOtherTaxColumns, DEC_ZERO, formatDec, parseDec,
  type AmaTaxColumn, type CustomsOperation, type CustomsRejection, type CustomsStage, type LayoutBlock, type LayoutField, type LayoutItem, type PostAmendment, type PostAmendmentLine,
  type PostAmendmentValues, type CopyPostAmendmentHeaderResult,
} from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { AMA_MESSAGES } from "./ama.messages";

export type AmaSubStep = "pick" | "edit" | "reason" | "declare";
const ORDER: readonly AmaSubStep[] = ["pick", "edit", "reason", "declare"];
const SUB_LABEL = { pick: "subPick", edit: "subEdit", reason: "subReason", declare: "subDeclare" } as const;
/** 4 bước nhỏ kèm nhãn theo ngôn ngữ giao diện. */
export const amaSubSteps = (locale: UiLocale): { id: AmaSubStep; label: string }[] => {
  const t = pickMessages(AMA_MESSAGES, locale);
  return ORDER.map((id) => ({ id, label: t[SUB_LABEL[id]] }));
};

/** Bước 7 chỉ có khi tờ khai đã thông quan hoặc đang sửa sau thông quan. */
export const postStepVisible = (stage: CustomsStage | undefined) => stage === "CLEARED" || Boolean(stage?.startsWith("POST_"));

export function defaultSubStep(a: PostAmendment): AmaSubStep {
  switch (a.status) {
    case "DRAFT": return a.lines.length ? "edit" : "pick";
    case "RECALLED": return "edit";
    default: return "declare";
  }
}

/** Bước xa nhất mở được: Nháp/Gọi về có dòng tới ③ (chưa duyệt thì chưa khai); đã duyệt trở đi tới ④. */
export function maxSubStep(a: PostAmendment): AmaSubStep {
  if (a.status === "DRAFT" || a.status === "RECALLED") return a.lines.length ? "reason" : "pick";
  return "declare";
}

/** `?sub=` hợp lệ và không vượt bước xa nhất thì xem; ngược lại về bước mặc định. */
export function resolveSubStep(a: PostAmendment, requested: string | null): AmaSubStep {
  const i = ORDER.indexOf(requested as AmaSubStep);
  return i >= 0 && i <= ORDER.indexOf(maxSubStep(a)) ? ORDER[i]! : defaultSubStep(a);
}

export const subStepEditable = (a: PostAmendment, s: AmaSubStep, canEdit: boolean) =>
  canEdit && s !== "declare" && (a.status === "DRAFT" || a.status === "RECALLED" || a.status === "APPROVED");

// ---------------------------------------------------------------- so sánh Trước | Sau

/** Một hàng so sánh: cột thuế của @kb/contracts (khóa Trước/Sau, kiểu ô, danh mục) + ô tiền thuế tự tính. */
export type CompareRow = AmaTaxColumn & { computed?: boolean };

/** Hàng so sánh thuế NK/XK; ô tiền thuế đổi nhãn ngắn theo ngôn ngữ giao diện, các ô khác giữ tên chỉ tiêu của @kb/contracts. */
export const importCompareRows = (locale: UiLocale): CompareRow[] =>
  AMA_IMPORT_TAX_COLUMNS.map((c) => ({
    ...c,
    label: c.before === "HAG_MKA" ? pickMessages(AMA_MESSAGES, locale).importTaxLabel : c.label,
    ...(c.after === "HAG_AKA" ? { computed: true } : {}),
  }));
export const otherCompareRows = (n: number): CompareRow[] =>
  amaOtherTaxColumns(n).map((c) => ({ ...c, ...(c.after === `HAG_AA${n}` ? { computed: true } : {}) }));

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

/** Dòng đang sửa = dòng đã lưu + các ô người khai đổi chưa lưu (theo thứ tự đổi), tính lại tiền thuế như khi lưu. */
export const applyEdits = (line: PostAmendmentLine, edits: Record<string, string>): PostAmendmentLine =>
  Object.entries(edits).reduce((l, [k, v]) => applyAmaLineEdit(l, k, v), line);

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

/** Ô tiền thuế Trước / Sau của dòng: thuế XNK + thu khác 1–5. */
const TAX_PAIRS: [string, string][] = [["HAG_MKA", "HAG_AKA"], ...AMA_OTHER_TAX_SLOTS.map((n): [string, string] => [`HAG_MA${n}`, `HAG_AA${n}`])];

export function amaChangeSummary(a: PostAmendment): { lines: number; changed: number; taxBefore: string; taxAfter: string; taxDelta: string } {
  let before = DEC_ZERO;
  let after = DEC_ZERO;
  let delta = DEC_ZERO;
  let changed = 0;
  for (const l of a.lines) {
    changed += changedKeys(l).length;
    for (const [b, af] of TAX_PAIRS) {
      before = addDec(before, parseDec(l.values[b]) ?? DEC_ZERO);
      after = addDec(after, parseDec(l.values[af]) ?? DEC_ZERO);
    }
    const d = amaLineDelta(l.values);
    for (const x of [d.importTax, ...d.other.map((o) => o.amount)]) delta = addDec(delta, parseDec(x) ?? DEC_ZERO);
  }
  return { lines: a.lines.length, changed, taxBefore: formatDec(before), taxAfter: formatDec(after), taxDelta: formatDec(delta) };
}

export function approveBlockers(a: PostAmendment, o: { pendingEdits: number; fourEyes: boolean }, locale: UiLocale): string[] {
  const t = pickMessages(AMA_MESSAGES, locale);
  return [
    !a.lines.length && t.blkNoLines,
    !a.header["TK_REC"]?.trim() && t.blkNoReason,
    o.pendingEdits > 0 && t.blkPending,
    o.fourEyes && t.blkFourEyes,
  ].filter((x): x is string => Boolean(x));
}

export function amaPrimaryAction(a: PostAmendment, o: { stage: CustomsStage; sending: boolean }, locale: UiLocale): { op: "AMA" | "AMC"; label: string } | null {
  if (o.sending) return null;
  const t = pickMessages(AMA_MESSAGES, locale);
  if (a.status === "APPROVED" && (o.stage === "POST_EDITING" || o.stage === "POST_RECALLED")) return { op: "AMA", label: t.primaryAma };
  if (a.status === "PRE_DECLARED" && o.stage === "POST_PRE_DECLARED") return { op: "AMC", label: t.primaryAmc };
  return null;
}

/** Nghiệp vụ của bản khai bổ sung – làm ở bước 7, bước 6 không hiện. */
export const AMA_OPS: ReadonlySet<CustomsOperation> = new Set<CustomsOperation>(["AMA", "AMB", "AMC"]);

// ---------------------------------------------------------------- bước ③: ô hiện sẵn / thông tin khác

const MAIN_KEYS = ["TK_REC", "TK_NTA"];
const keep = (f: LayoutField) => !amaHeaderLocked(f.key) && !MAIN_KEYS.includes(f.key) && f.origin !== "CUSTOMS";

/** Bước ③: hiện sẵn Mã lý do + Ghi chú sau; các ô sửa được còn lại của đầu bản khai vào "Thông tin khác" (bỏ ô khóa theo tờ khai gốc). */
export function reasonLayout(locale: UiLocale): { main: LayoutBlock; other: LayoutBlock[] } {
  const fields = AMA_HEADER_LAYOUT.flatMap((b) => b.items).filter((i): i is LayoutField => i.kind === "field");
  const main: LayoutBlock = { id: "ama-ly-do-chinh", title: pickMessages(AMA_MESSAGES, locale).reasonBlock, items: MAIN_KEYS.map((k) => fields.find((f) => f.key === k)!) };
  const other = AMA_HEADER_LAYOUT.map((b) => ({
    ...b,
    items: b.items.flatMap((i): LayoutItem[] => {
      if (i.kind === "field") return keep(i) ? [i] : [];
      const kept = i.fields.filter(keep);
      return kept.length ? [{ ...i, fields: kept }] : [];
    }),
  })).filter((b) => b.items.length > 0);
  return { main, other };
}

/** Ô bắt buộc của "Thông tin khác" còn trống – có thì khối tự mở và báo. */
export function missingOther(header: PostAmendmentValues): LayoutField[] {
  // Chỉ xét ô (không dùng tiêu đề khối) → ngôn ngữ nào cũng như nhau.
  return reasonLayout("vi")
    .other.flatMap((b) => b.items.flatMap((i) => (i.kind === "field" ? [i] : i.fields)))
    .filter((f) => f.required && !header[f.key]?.trim());
}

// ---------------------------------------------------------------- bước ④: lỗi Hải quan, nút xem lại

/**
 * Lỗi Hải quan của bản khai đang mở (AMA/AMB/AMC, từ sau khi lập bản khai này). Backend chỉ xóa lỗi khi chính nghiệp vụ đó gửi lại thành công,
 * nên lỗi AMB của bản trước có thể còn – so thời điểm với lúc lập. `fixable`: AMA bị từ chối thì sửa nội dung rồi khai lại; AMB/AMC thì không.
 */
export function amaRejection(
  a: PostAmendment,
  rejection: CustomsRejection | null,
  isCurrent: boolean,
): { rejection: CustomsRejection; fixable: boolean } | null {
  if (!isCurrent || !rejection || !AMA_OPS.has(rejection.operation) || rejection.at < a.createdAt) return null;
  return { rejection, fixable: rejection.operation === "AMA" };
}

/** Ô dòng hàng cần gửi khi lưu: giá trị người khai nhập (không phải giá trị đã tính) – "" = bỏ sửa tay, máy chủ tự tính lại. */
export const lineSaves = (edits: Record<string, Record<string, string>>, lineIds: readonly string[]) =>
  lineIds.flatMap((lineId) => Object.entries(edits[lineId] ?? {}).map(([key, value]) => ({ lineId, key, value })));

/** Bước ④ → xem lại: đã duyệt thì về ③ (còn sửa được), đã khai thì xem nội dung sửa (chỉ đọc). */
export const reviewTarget = (a: PostAmendment): AmaSubStep => (a.status === "APPROVED" ? "reason" : "edit");

/** Tên chỉ tiêu ô đầu bản khai (tên pháp lý theo @kb/contracts – không dịch); khóa không có trong bố cục → giữ khóa. */
export function amaHeaderLabel(key: string): string {
  for (const b of AMA_HEADER_LAYOUT) {
    for (const i of b.items) {
      const f = (i.kind === "field" ? [i] : i.fields).find((x) => x.key === key);
      if (f) return f.label;
    }
  }
  return key;
}

/** Kết quả "Tạo AMA cùng nội dung cho các tờ đã thông quan khác" thành các dòng chữ theo ngôn ngữ: tờ đã áp dụng, rồi từng tờ bỏ qua kèm lý do. */
export function copyResultLines(r: CopyPostAmendmentHeaderResult, locale: UiLocale): string[] {
  const t = pickMessages(AMA_MESSAGES, locale);
  const skip = { NOT_CLEARED: t.skipNOT_CLEARED, OPEN_NOT_DRAFT: t.skipOPEN_NOT_DRAFT, BUSY: t.skipBUSY } as const;
  return [
    r.applied.length ? fill(t.copyApplied, { sheets: r.applied.join(", ") }) : t.copyNone,
    ...r.skipped.map((s) => fill(t.copySkipped, { no: s.no, reason: skip[s.reason] })),
  ];
}
