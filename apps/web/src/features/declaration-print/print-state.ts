// Logic thuần của bản in tờ khai (Review bước 5): vị trí ô trên bố cục, số ước tính, trạng thái ô, danh sách ô cần xử lý, số trang.
import {
  branchRanges, expandRepeat, formKeysOf, itemFieldClass, itemFieldCode, itemFields, layoutFor, otherFieldKeys, parseItemFieldCode, printKeys, printLayoutFor, requiredGaps,
  type ConditionContext, type ConditionId, type DeclarationBranch, type RequiredGap, type Declaration, type DeclarationEditMode, type LayoutBlock, type LayoutField, type LineItem, type SubmissionView,
} from "@kb/contracts";
import type { PaperFieldState } from "@kb/ui";
import { conditionContext, isApplicable, type FormValues } from "../declaration-form/form-state";
import { customsItemValues, customsValues } from "../declaration-form/customs-adapter";
import { declarationValues, itemValues } from "../declaration-form/dossier-adapter";
import { fieldErrors, type FieldError } from "../dossier-detail/steps/customs-errors";
import { fromMinor, sumMinor, toMinor } from "@/lib/decimal";
import { codeLabel, displayValue } from "../declaration-form/display";
import { NOT_ISSUED } from "./print.vi";

export { NOT_ISSUED };

type Kind = "IDA" | "EDA";

/** Ô được chọn trên bản in: `line` = chỉ số dòng hàng (0-based) khi ô thuộc dòng hàng. */
export type PrintTarget = { key: string; line?: number };

/**
 * Vị trí một ô trên bố cục Phụ lục II. group = các ô cùng LayoutGroup / cùng dòng LayoutRepeat (hoặc [field]).
 * repeatRow / repeatCount: số dòng (1-based) và số dòng của nhóm khi ô thuộc nhóm lặp; fillAny: ô thuộc nhóm "chỉ cần một ô".
 */
export type FieldSpot = {
  field: LayoutField; group: LayoutField[]; parentNo?: string; parentCondition?: ConditionId; blockCondition?: ConditionId; scope: "decl" | "item";
  repeatRow?: number; repeatCount?: number; fillAny?: boolean;
};

function locate(blocks: LayoutBlock[], scope: "decl" | "item", out: Map<string, FieldSpot>) {
  const put = (spot: FieldSpot) => { if (!out.has(spot.field.key)) out.set(spot.field.key, spot); };
  for (const b of blocks) {
    const base: Pick<FieldSpot, "scope" | "blockCondition"> = { scope, ...(b.condition ? { blockCondition: b.condition } : {}) };
    for (const it of b.items) {
      if (it.kind === "field") { put({ ...base, field: it, group: [it] }); continue; }
      const parent = { ...base, ...(it.no ? { parentNo: it.no } : {}), ...(it.condition ? { parentCondition: it.condition } : {}) };
      if (it.kind === "group") {
        for (const f of it.fields) put({ ...parent, field: f, group: it.fields, ...(it.fill === "any" ? { fillAny: true } : {}) });
        continue;
      }
      expandRepeat(it).forEach((row, i) => { for (const f of row) put({ ...parent, field: f, group: row, repeatRow: i + 1, repeatCount: it.count }); });
    }
  }
}

const locators = new Map<Kind, Map<string, FieldSpot>>();
/** Khóa ô → vị trí trên bố cục (đầu trang, hai tab, dòng hàng). */
export function fieldLocator(kind: Kind): Map<string, FieldSpot> {
  const cached = locators.get(kind);
  if (cached) return cached;
  const l = layoutFor(kind);
  const out = new Map<string, FieldSpot>();
  locate(l.declarant.flatMap((s) => s.blocks), "decl", out);
  locate(l.customs.flatMap((s) => s.blocks), "decl", out);
  // Đầu trang sau hai tab: ô đầu trang lặp lại ô của tab Hải quan (TK_A09…) giữ nhóm của tab.
  for (const f of l.summary) if (!out.has(f.key)) out.set(f.key, { field: f, group: [f], scope: "decl" });
  locate(l.item.declarant, "item", out);
  locate(l.item.customs, "item", out);
  locators.set(kind, out);
  return out;
}

/** Tổng số trang = trang chung + ceil(số dòng hàng / số khối mỗi trang). */
export function pageCount(kind: Kind, lines: number): number {
  const p = printLayoutFor(kind);
  return p.pages.length + Math.ceil(Math.max(0, lines) / p.itemsPerPage);
}

export type Estimate = { customsValueVnd: string; currency: string; exchangeRate: string; taxVnd?: string; lines: number };

/** Ô Hải quan còn trống → điền số ứng dụng ước tính (đánh dấu trong `estimated`); ô đã có số Hải quan giữ nguyên. */
export function estimateValues(kind: Kind, customs: FormValues, est: Estimate): { values: FormValues; estimated: Set<string> } {
  const pages = String(pageCount(kind, est.lines));
  const lines = String(est.lines);
  const plan: [string, string | undefined][] = kind === "IDA"
    ? [["TK_A86", est.customsValueVnd], ["THUE_KJ1", est.currency], ["THUE_KK1", est.exchangeRate], ["THUE_B02", est.taxVnd], ["TK_B12", pages], ["TK_B13", lines]]
    : [["TK_RC1", est.currency], ["TK_RD1", est.exchangeRate], ["TK_K69", pages], ["TK_K70", lines]];
  const values: FormValues = { ...customs };
  const estimated = new Set<string>();
  for (const [key, v] of plan) {
    if (customs[key]?.trim() || v === undefined || !v.trim()) continue;
    values[key] = v;
    estimated.add(key);
  }
  return { values, estimated };
}

const DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)$/;
const toNumber = (t: string): number | null => (DECIMAL.test(t) ? Number(t) : null);

/**
 * Số Hải quan (có thể viết kiểu VN) → các cách đọc. Có cả chấm và phẩy → dấu sau cùng là thập phân;
 * một loại dấu xuất hiện nhiều lần → phân cách nghìn; xuất hiện một lần với đúng 3 chữ số theo sau → mơ hồ (đọc cả hai cách);
 * còn lại → thập phân.
 */
function customsReadings(s: string): number[] {
  const t = s.replace(/\s/g, "");
  if (!t) return [];
  const dot = t.lastIndexOf(".");
  const comma = t.lastIndexOf(",");
  let candidates = [t];
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? "." : ",";
    candidates = [t.replaceAll(dec === "." ? "," : ".", "").replace(dec, ".")];
  } else if (dot >= 0 || comma >= 0) {
    const parts = t.split(dot >= 0 ? "." : ",");
    if (parts.length > 2) candidates = [parts.join("")];
    else if (parts[1]?.length === 3) candidates = [parts.join(""), parts.join(".")];
    else candidates = [parts.join(".")];
  }
  return candidates.map(toNumber).filter((n): n is number => n !== null);
}

/**
 * Số Hải quan trả về có bằng số của ứng dụng không. `app` = DecimalString chuẩn (chấm thập phân, không phân cách nghìn – "170.125000");
 * `customs` có thể viết kiểu VN ("886.187.500", "170,125"); cách viết mơ hồ ("1.500") khớp nếu một trong hai cách đọc bằng.
 * Rỗng ở bất kỳ bên nào → false.
 */
export function sameNumber(customs: string, app: string): boolean {
  const y = toNumber(app.trim());
  return y !== null && customsReadings(customs).some((x) => x === y);
}

/** Khóa ô của các chỉ tiêu người dùng đã sửa (source "USER"). */
export function editedKeys(kind: Kind, fields: { code: string; source: string }[]): Set<string> {
  return new Set(fields.filter((f) => f.source === "USER").flatMap((f) => formKeysOf(kind, f.code)));
}

/** Trạng thái ô trên bản in: error > missing > estimate > edited > none. */
export function cellState(a: { error: boolean; missing: boolean; estimated: boolean; edited: boolean }): PaperFieldState {
  if (a.error) return "error";
  if (a.missing) return "missing";
  if (a.estimated) return "estimate";
  if (a.edited) return "edited";
  return "none";
}

export type AttentionCell = { key: string; line?: number; reason: "ERROR" | "MISSING" };

type Slot = { key: string; line?: number };
const slotId = (c: Slot) => `${c.line ?? ""}:${c.key}`;

/** Thứ tự nhảy của mọi ô: printKeys (tờ khai, rồi từng dòng hàng), sau đó "Chỉ tiêu khác" (tờ khai, rồi từng dòng). */
function slotOrder(kind: Kind, rows: number): Slot[] {
  const loc = fieldLocator(kind);
  const order: Slot[] = [];
  const seen = new Set<string>();
  const push = (s: Slot) => {
    const spot = loc.get(s.key);
    if (!spot || spot.scope !== (s.line === undefined ? "decl" : "item") || seen.has(slotId(s))) return;
    seen.add(slotId(s));
    order.push(s);
  };
  for (const keys of [printKeys(printLayoutFor(kind)), otherFieldKeys(kind)]) {
    for (const key of keys.decl) push({ key });
    for (let line = 0; line < rows; line++) for (const key of keys.item) push({ key, line });
  }
  return order;
}

/** Thứ tự Tab trong panel sửa ô: thứ tự in (đầu trang, trang chung, từng dòng hàng) rồi "Chỉ tiêu khác". `line` 0-based. */
export function panelOrder(kind: Kind, lines: number): PrintTarget[] {
  return slotOrder(kind, Math.max(0, lines));
}

/** Ô kế tiếp (dir 1) / trước (dir -1) trong `order`, bỏ qua ô cùng nhóm (`groupKeys`) cùng dòng với `current` (panel đã hiện cả nhóm); quay vòng. */
export function nextTarget(order: PrintTarget[], current: PrintTarget, groupKeys: string[], dir: 1 | -1): PrintTarget | undefined {
  const n = order.length;
  const i = order.findIndex((t) => t.key === current.key && t.line === current.line);
  for (let step = 1; step <= n; step++) {
    const t = order[(((i + dir * step) % n) + n) % n]!;
    if (t.line !== current.line || !groupKeys.includes(t.key)) return t;
  }
  return undefined;
}

/** Ô của chỉ tiêu mỗi lỗi, theo thứ tự `order`. Lỗi không có `no` / dòng không có trong `lineNos` → []. */
function slotsPerError(kind: Kind, order: Slot[], errors: FieldError[], lineNos: number[]): Slot[][] {
  const loc = fieldLocator(kind);
  const noOf = (s: Slot) => { const spot = loc.get(s.key)!; return spot.field.no ?? spot.parentNo; };
  return errors.map((e) => {
    if (!e.no) return [];
    const line = e.line === undefined ? undefined : lineNos.indexOf(e.line);
    if (line === -1) return [];
    return order.filter((s) => s.line === line && noOf(s) === e.no);
  });
}

/**
 * Mọi ô (khóa tờ khai, hoặc khóa dòng hàng + chỉ số dòng 0-based) thuộc chỉ tiêu của các lỗi, theo thứ tự nhảy.
 * `error.line` (số dòng hàng, 1-based) → chỉ số dòng = vị trí trong `lineNos`; không tìm thấy → bỏ qua.
 */
export function errorSlots(kind: Kind, errors: FieldError[], lineNos: number[]): PrintTarget[] {
  const order = slotOrder(kind, lineNos.length);
  const hit = new Set(slotsPerError(kind, order, errors, lineNos).flat().map(slotId));
  return order.filter((s) => hit.has(slotId(s)));
}

/**
 * Ô cần xử lý theo thứ tự nhảy: mọi ô lỗi rồi mới tới ô còn thiếu; trong mỗi nhóm theo `slotOrder`.
 * Mỗi lỗi gắn vào ô đầu tiên (theo thứ tự đó) của chỉ tiêu (xem `errorSlots`).
 */
export function attentionCells(kind: Kind, decl: FormValues, items: FormValues[], errors: FieldError[], lineNos: number[]): AttentionCell[] {
  const order = slotOrder(kind, items.length);
  const errorIds = new Set(slotsPerError(kind, order, errors, lineNos).flatMap((slots) => (slots[0] ? [slotId(slots[0])] : [])));

  // Ô bắt buộc còn trống: cùng quy tắc nút Phê duyệt / Ký số và backend (@kb/contracts requiredGaps).
  const missingIds = new Set(requiredGaps(kind, decl, items).map(slotId));
  const cell = (s: Slot, reason: AttentionCell["reason"]): AttentionCell => ({ key: s.key, ...(s.line === undefined ? {} : { line: s.line }), reason });
  const out = order.filter((s) => errorIds.has(slotId(s))).map((s) => cell(s, "ERROR"));
  for (const s of order) {
    if (errorIds.has(slotId(s))) continue;
    if (missingIds.has(slotId(s))) out.push(cell(s, "MISSING"));
  }
  return out;
}

/**
 * Giá trị in của tờ khai: người khai (dossier-adapter) + Hải quan trả về (customs-adapter) + số ứng dụng ước tính cho ô Hải quan còn trống;
 * từng dòng hàng; lỗi Hải quan. Dùng chung cho bản in và huy hiệu tab "Tờ khai" (cùng một nguồn số ô cần xử lý).
 */
export type PrintData = {
  kind: Kind; lineNos: number[]; values: FormValues; itemRows: FormValues[]; errors: FieldError[];
  /** Số Hải quan trả về (chưa điền ước tính) và số ứng dụng ước tính – để so sánh trên ô. */
  customs: FormValues; estimate: FormValues; estimated: Set<string>;
};

/** Phần theo tờ của printData (printStateFor): số dòng in trên tờ, ô 1.2 (TK_FIC/TK_BNO/TK_DNO), tổng trị giá/thuế của tờ. */
export type SheetValues = { lineNos?: number[]; cover?: FormValues; totals?: DeclarationBranch | null };

export function printData(decl: Declaration, items: LineItem[], submission: SubmissionView | undefined, sheet: SheetValues = {}): PrintData {
  const kind: Kind = decl.kind;
  const lineNos = sheet.lineNos ?? items.map((it) => it.lineNo);
  const totals = sheet.totals ?? null;
  const currency = decl.fields.find((f) => f.code === "MA_TT")?.value.trim() || "USD";
  const vbpq = decl.fields.find((f) => f.code === "VBPQ")?.value ?? "";
  const info = submission?.customsInfo ?? null;
  const customs = customsValues(kind, info, submission?.result ?? null);
  const est: Estimate = {
    customsValueVnd: totals?.customsValueVnd ?? decl.customsValueVnd, currency, exchangeRate: decl.exchangeRate, lines: items.length,
    // Cộng tiền bằng số nguyên đồng (lib/decimal), không cộng số thực.
    ...(kind === "IDA" ? { taxVnd: fromMinor(sumMinor([toMinor(totals?.estImportDutyVnd ?? decl.estimatedImportDutyVnd, 0), toMinor(totals?.estVatVnd ?? decl.estimatedVatVnd, 0)]), 0) } : {}),
  };
  const { values: customsFilled, estimated } = estimateValues(kind, customs, est);
  const estimate = estimateValues(kind, {}, est).values;
  const values: FormValues = { ...declarationValues(kind, decl.fields), ...sheet.cover, ...customsFilled };
  const customsItems = customsItemValues(kind, info, lineNos);
  const itemRows = itemValues(kind, items, { fields: decl.fields, currency, vbpq }).map((v, i) => ({ ...v, ...customsItems[i] }));
  const errors = fieldErrors(kind, submission?.rejection ?? null);
  return { kind, lineNos, values, itemRows, errors, customs, estimate, estimated };
}

/** Một tờ khai nhánh trên thanh chọn tờ: số tờ / tổng số tờ, lineNo thật của dòng đầu và dòng cuối. */
export type SheetInfo = { no: number; of: number; lineFrom: number; lineTo: number };

/**
 * Bản in theo tờ đang chọn (lô > 50 dòng tách thành N tờ, mỗi tờ tối đa 50 dòng theo lineNo – branchRanges).
 * `items` = dòng của tờ (giữ id, lineNo thật để sửa đúng dòng); `lineNos` = số in trên tờ 1..50 như VNACCS (lô 1 tờ: lineNo thật);
 * `cover` = ô 1.2: tờ 1 "F", tờ sau số tờ khai của tờ 1 ("—" khi chưa có), số nhánh, tổng số tờ (lô 1 tờ: không điền);
 * `totals` = tổng trị giá/thuế của tờ (lô 1 tờ: null – dùng tổng của tờ khai); `submission` = trạng thái Hải quan của nhánh (số tờ khai, lỗi, giai đoạn).
 */
export type PrintSheet<T extends { lineNo: number }> = SheetInfo & {
  items: T[]; lineNos: number[]; cover: FormValues; totals: DeclarationBranch | null; submission: SubmissionView | undefined; sheets: SheetInfo[];
};

export function printStateFor<T extends { lineNo: number }>(view: { items: T[]; branches?: DeclarationBranch[] }, branchNo: number, submission?: SubmissionView): PrintSheet<T> {
  const sorted = [...view.items].sort((a, b) => a.lineNo - b.lineNo);
  const ranges = branchRanges(sorted.map((it) => it.lineNo));
  const of = ranges.length;
  const sheets = ranges.map(({ no, lineFrom, lineTo }) => ({ no, of, lineFrom, lineTo }));
  if (of === 1) return { ...sheets[0]!, sheets, items: view.items, lineNos: view.items.map((it) => it.lineNo), cover: {}, totals: null, submission };
  const r = ranges[Math.min(of, Math.max(1, Math.trunc(branchNo))) - 1]!;
  const items = sorted.slice(r.index[0], r.index[1]);
  const first = submission?.branches.find((b) => b.no === 1)?.declarationNo;
  const own = submission?.branches.find((b) => b.no === r.no);
  return {
    ...sheets[r.no - 1]!, sheets, items, lineNos: items.map((_, i) => i + 1),
    cover: { TK_FIC: r.no === 1 ? "F" : first || "—", TK_BNO: String(r.no), TK_DNO: String(of) },
    totals: view.branches?.find((b) => b.no === r.no) ?? null,
    submission: submission && own ? { ...submission, stage: own.stage, result: own.result, customsInfo: own.customsInfo, rejection: own.rejection } : submission,
  };
}

/**
 * Việc cần xử lý theo từng tờ khai nhánh (mỗi tờ với trạng thái Hải quan của nhánh – printStateFor). `common` = ô tờ khai còn thiếu
 * (chỉ tiêu chung, giống nhau ở mọi tờ – đếm một lần); `sheets[k-1]` = phần riêng của tờ k (ô dòng hàng, lỗi Hải quan của nhánh, lỗi không gắn được);
 * `total` = common + tổng phần riêng (huy hiệu tab). Lô 1 tờ: total = printIssuesOf(...).count.
 */
export function sheetIssueCounts(
  decl: Declaration, items: LineItem[], branches: DeclarationBranch[] | undefined, submission: SubmissionView | undefined, mode: DeclarationEditMode, canEdit: boolean, lineModes?: Record<number, DeclarationEditMode>,
): { common: number; sheets: number[]; total: number } {
  const view = { items, ...(branches ? { branches } : {}) };
  const of = printStateFor(view, 1).of;
  let common = 0;
  const sheets = Array.from({ length: of }, (_, k) => {
    const st = printStateFor(view, k + 1, submission);
    const is = printIssues(printData(decl, st.items, st.submission, st), mode, canEdit, lineModes?.[k + 1] ?? mode);
    const shared = is.cells.filter((c) => c.line === undefined && c.reason === "MISSING").length;
    if (k === 0) common = shared;
    return is.count - shared;
  });
  return { common, sheets, total: common + sheets.reduce((n, x) => n + x, 0) };
}

/** Chỉ số dòng (0-based, theo thứ tự `lineNos` của cả lô) → tờ chứa dòng + chỉ số dòng trong tờ (cùng cách chia của printStateFor). */
export function sheetTarget(lineNos: number[], line: number): { no: number; line: number } {
  const ranges = branchRanges(lineNos);
  if (ranges.length === 1) return { no: 1, line };
  const pos = [...lineNos].sort((a, b) => a - b).indexOf(lineNos[line]!);
  const r = ranges.find((x) => pos >= x.index[0] && pos < x.index[1]) ?? ranges[0]!;
  return { no: r.no, line: pos - r.index[0] };
}

/**
 * Ô trên bản in của một chỉ tiêu tờ khai (mã lưu trữ, vd "VBPQ" hoặc "HANG.<id dòng>.<ô>") – để đưa người dùng tới ô bị đánh dấu cần kiểm tra.
 * `line` = chỉ số dòng (0-based) trong `items`. Chỉ tiêu không có ô trên mẫu in ("Chỉ tiêu khác") / dòng không còn → null.
 */
export function fieldCell(kind: Kind, code: string, items: { id: string }[]): PrintTarget | null {
  const keys = printKeys(printLayoutFor(kind));
  const item = parseItemFieldCode(code);
  if (item) {
    const line = items.findIndex((i) => i.id === item.itemId);
    return line >= 0 && keys.item.includes(item.key) ? { key: item.key, line } : null;
  }
  const key = formKeysOf(kind, code).find((k) => keys.decl.includes(k));
  return key ? { key } : null;
}

/** Ô tên do Hải quan trả về theo mã người khai chọn (tên địa điểm lưu kho theo mã A202) – trước khi Hải quan trả, tra danh mục để hiện ước tính. */
export const LOOKUP_NAME_CELLS: Record<Kind, { code: string; name: string }[]> = {
  IDA: [{ code: "VD_ST", name: "VD_A51" }],
  EDA: [{ code: "TK_ST", name: "TK_K42" }],
};

/** Điền tên tra từ danh mục vào ô tên Hải quan còn trống (đánh dấu ước tính); Hải quan đã trả tên → giữ tên Hải quan. */
export function withLookupNames(data: PrintData, names: Record<string, string | undefined>): PrintData {
  const fill = Object.entries(names).filter((e): e is [string, string] => Boolean(e[1]) && !data.values[e[0]]?.trim());
  if (!fill.length) return data;
  const estimated = new Set(data.estimated);
  const values = { ...data.values };
  for (const [k, v] of fill) {
    values[k] = v;
    estimated.add(k);
  }
  return { ...data, values, estimated };
}

/** Ô cần xử lý của bản in. Tờ khai chỉ đọc (LOCKED / không có quyền sửa): bỏ ô còn thiếu (không làm gì được), giữ ô lỗi Hải quan. */
export function printAttention(data: PrintData, mode: DeclarationEditMode, canEdit: boolean, lineMode: DeclarationEditMode = mode): AttentionCell[] {
  const cells = attentionCells(data.kind, data.values, data.itemRows, data.errors, data.lineNos);
  // Ô tờ khai theo `mode` (chỉ tiêu chung), ô dòng hàng theo `lineMode` (tờ đang xem – lô chỉ gọi về một số tờ).
  return !canEdit ? cells.filter((c) => c.reason !== "MISSING") : cells.filter((c) => c.reason !== "MISSING" || (c.line === undefined ? mode : lineMode) !== "LOCKED");
}

/** Lỗi Hải quan không gắn được vào ô nào (không có số chỉ tiêu, dòng hàng không có, chỉ tiêu không có trên bản in) – liệt kê riêng. */
export function unplacedErrors(kind: Kind, errors: FieldError[], lineNos: number[]): FieldError[] {
  const slots = slotsPerError(kind, slotOrder(kind, lineNos.length), errors, lineNos);
  return errors.filter((_, i) => slots[i]!.length === 0);
}

/** Việc cần xử lý của bản in: ô (lỗi → còn thiếu) + lỗi không gắn được vào ô. `count` = huy hiệu tab và số trên thanh công cụ. */
export type PrintIssues = { cells: AttentionCell[]; unplaced: FieldError[]; count: number };

export function printIssues(data: PrintData, mode: DeclarationEditMode, canEdit: boolean, lineMode: DeclarationEditMode = mode): PrintIssues {
  const cells = printAttention(data, mode, canEdit, lineMode);
  const unplaced = unplacedErrors(data.kind, data.errors, data.lineNos);
  return { cells, unplaced, count: cells.length + unplaced.length };
}

/** Việc cần xử lý từ dữ liệu tờ khai (huy hiệu tab "Tờ khai" ở review-step – cùng hàm với thanh công cụ của bản in). */
export function printIssuesOf(decl: Declaration, items: LineItem[], submission: SubmissionView | undefined, mode: DeclarationEditMode, canEdit: boolean): PrintIssues {
  return printIssues(printData(decl, items, submission), mode, canEdit);
}

const DECLARATION_NO = new Set(["TK_ICN", "TK_ECN"]);

/**
 * Chữ in trong ô bản in: rỗng → "" (ô ngày rỗng in "/ /" như mẫu, số tờ khai rỗng in "Chưa cấp"); ô mã có danh mục → "mã  tên"; còn lại theo `displayValue`.
 * Hai khoảng trắng giữa mã và tên: một khoảng không ngắt dòng + một khoảng thường (HTML gộp khoảng trắng liền nhau).
 */
export function printValue(field: Pick<LayoutField, "key" | "input" | "options" | "codeTable"> | undefined, raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return field && DECLARATION_NO.has(field.key) ? NOT_ISSUED : field?.input === "date" ? "/ /" : "";
  if (!field) return v;
  const name = codeLabel(field.codeTable, v);
  // Trang giấy là văn bản pháp lý tiếng Việt: ngày/số định dạng kiểu Việt Nam ở mọi ngôn ngữ giao diện.
  return name ? `${v}\u00a0 ${name}` : displayValue(field, v, "vi");
}

/**
 * Bản ngắn của ô mã (trang giấy hẹp và bản in, như mẫu VNACCS chỉ in mã): ô có tên theo bảng mã / lựa chọn / "mã · nghĩa"
 * (mã phân loại kiểm tra, trạng thái Hải quan) → chỉ mã; ô khác → null (in như printValue).
 */
export function printCode(field: Pick<LayoutField, "key" | "input" | "options" | "codeTable"> | undefined, raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || !field) return null;
  if (codeLabel(field.codeTable, v) || field.options?.some((o) => o.value === v)) return v;
  return displayValue(field, v, "vi").startsWith(`${v} · `) ? v : null;
}

/**
 * Giá trị không được bẻ giữa cụm (PaperField keepTogether – chỉ xuống dòng sau "/", ":", "-", "."): ngày, giờ, mã / số định danh
 * (chữ + số liền nhau, không giới hạn độ dài: số tờ khai 12 số, số vận đơn). Số tiền (dấu chấm/phẩy nghìn) và chữ có khoảng trắng: không.
 */
export function keepTogetherValue(value: string, input?: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return input === "date" || /^\d{1,2}:\d{2}(:\d{2})?$/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v) || /^[A-Za-z0-9]+$/.test(v);
}

/** Ô "Chỉ tiêu khác" (không có trên mẫu in) đang áp dụng – khối, chỉ tiêu cha và chính ô đều thỏa điều kiện. */
export function otherFieldCells(kind: Kind, decl: FormValues, items: FormValues[]): { decl: string[]; items: string[][] } {
  const loc = fieldLocator(kind);
  const keys = otherFieldKeys(kind);
  const applicable = (key: string, ctx: ConditionContext) => {
    const spot = loc.get(key);
    if (!spot) return false;
    return isApplicable({ condition: spot.blockCondition }, ctx) && isApplicable({ condition: spot.parentCondition }, ctx) && isApplicable(spot.field, ctx);
  };
  const declCtx = conditionContext(kind, decl);
  return {
    decl: keys.decl.filter((k) => applicable(k, declCtx)),
    items: items.map((v) => { const ctx = conditionContext(kind, v); return keys.item.filter((k) => applicable(k, ctx)); }),
  };
}

export type OtherGroup = { id: string; title: string; keys: string[] };

/** Nhóm ô theo khối Phụ lục II (thứ tự khối của bố cục, trong khối giữ thứ tự `keys`); khối không có ô → bỏ. */
function groupByBlock(blocks: LayoutBlock[], keys: string[]): OtherGroup[] {
  const blockOf = new Map<string, string>();
  for (const b of blocks) for (const f of b.items.flatMap(itemFields)) if (!blockOf.has(f.key)) blockOf.set(f.key, b.id);
  return blocks
    .map((b) => ({ id: b.id, title: b.title, keys: keys.filter((k) => blockOf.get(k) === b.id) }))
    .filter((g) => g.keys.length > 0);
}

/** "Chỉ tiêu khác" nhóm theo khối Phụ lục II: phần tờ khai, và từng dòng hàng (mỗi dòng nhóm theo khối của dòng hàng). */
export function otherFieldGroups(kind: Kind, decl: FormValues, items: FormValues[]): { decl: OtherGroup[]; items: OtherGroup[][] } {
  const cells = otherFieldCells(kind, decl, items);
  const l = layoutFor(kind);
  const declBlocks = l.declarant.flatMap((sec) => sec.blocks);
  return { decl: groupByBlock(declBlocks, cells.decl), items: cells.items.map((keys) => groupByBlock(l.item.declarant, keys)) };
}

/** Ô bắt buộc còn trống của tờ khai – nút Phê duyệt / Ký số khóa khi còn ô (cùng quy tắc mock + backend: @kb/contracts requiredGaps). */
export function declarationGapsOf(decl: Declaration, items: LineItem[], submission: SubmissionView | undefined): { gaps: RequiredGap[]; lineNos: number[] } {
  const data = printData(decl, items, submission);
  return { gaps: requiredGaps(data.kind, data.values, data.itemRows), lineNos: data.lineNos };
}

/** Khối thuế của dòng hàng (bố cục form): mã thuế khai giống nhau cho nhiều dòng → panel cho áp một lần cho mọi dòng. */
const TAX_BLOCKS: Record<Kind, ReadonlySet<string>> = { IDA: new Set(["thue-nk", "thu-khac"]), EDA: new Set(["thue-xk"]) };
const taxCodeCache = new Map<Kind, Set<string>>();
/** Ô mã người khai nhập trong khối thuế của dòng hàng (1.80 biểu thuế, 1.92/1.95 miễn giảm, 1.94 mã áp dụng thuế suất…); không gồm số tiền, mã HS, xuất xứ. */
export function taxCodeKeys(kind: Kind): Set<string> {
  const hit = taxCodeCache.get(kind);
  if (hit) return hit;
  const out = new Set(
    layoutFor(kind).item.declarant.filter((b) => TAX_BLOCKS[kind].has(b.id)).flatMap((b) => b.items.flatMap(itemFields))
      .filter((f) => f.input === "code" && f.origin !== "CUSTOMS" && itemFieldClass(kind, f.key) === "INPUT").map((f) => f.key),
  );
  taxCodeCache.set(kind, out);
  return out;
}

/**
 * Áp mã thuế của dòng đang sửa cho các dòng hàng khác: với mỗi ô `keys` có giá trị (ô trống không áp – tránh xóa hàng loạt),
 * dòng nào đang khác thì thêm một chỉ tiêu cần lưu. `lines` = số dòng được đổi.
 */
export function applyToOtherLines(
  items: { id: string }[], rows: FormValues[], line: number, draft: FormValues, keys: string[],
): { edits: { code: string; value: string }[]; lines: number } {
  const set = keys.map((k) => [k, (draft[k] ?? "").trim()] as const).filter(([, v]) => v !== "");
  const edits: { code: string; value: string }[] = [];
  let lines = 0;
  items.forEach((it, i) => {
    if (i === line) return;
    const diff = set.filter(([k, v]) => (rows[i]?.[k] ?? "").trim() !== v);
    if (diff.length > 0) lines++;
    for (const [k, v] of diff) edits.push({ code: itemFieldCode(it.id, k), value: v });
  });
  return { edits, lines };
}

/**
 * Ô ẩn khỏi bản in khi Hải quan chưa trả kết quả (chưa khai / chưa phản hồi): ô Hải quan trả về còn trống – chưa có gì để xem.
 * Vẫn hiện: số tờ khai ("Chưa cấp") và ô Hải quan đã có số ứng dụng ước tính.
 */
export function hiddenUntilCustoms(kind: Kind, key: string, raw: string): boolean {
  return fieldLocator(kind).get(key)?.field.origin === "CUSTOMS" && !raw.trim() && !DECLARATION_NO.has(key);
}

/** Hải quan đã trả thông tin tờ khai (khai tạm / chính thức) – từ đó hiện đủ các ô Hải quan trả về. */
export const customsAnswered = (submission: SubmissionView | undefined): boolean => Boolean(submission?.customsInfo || submission?.result);
