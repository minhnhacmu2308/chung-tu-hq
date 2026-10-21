// Logic thuần của bản in tờ khai (Review bước 5): vị trí ô trên bố cục, số ước tính, trạng thái ô, danh sách ô cần xử lý, số trang.
import {
  expandRepeat, formKeysOf, itemFields, layoutFor, otherFieldKeys, printKeys, printLayoutFor, requiredGaps,
  type ConditionContext, type ConditionId, type RequiredGap, type Declaration, type DeclarationEditMode, type LayoutBlock, type LayoutField, type LineItem, type SubmissionView,
} from "@kb/contracts";
import type { PaperFieldState } from "@kb/ui";
import { conditionContext, isApplicable, type FormValues } from "../declaration-form/form-state";
import { customsItemValues, customsValues } from "../declaration-form/customs-adapter";
import { declarationValues, itemValues } from "../declaration-form/dossier-adapter";
import { fieldErrors, type FieldError } from "../dossier-detail/steps/customs-errors";
import { fromMinor, sumMinor, toMinor } from "@/lib/decimal";
import { codeLabel, displayValue } from "../declaration-form/display";

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

export function printData(decl: Declaration, items: LineItem[], submission: SubmissionView | undefined): PrintData {
  const kind: Kind = decl.kind;
  const lineNos = items.map((it) => it.lineNo);
  const currency = decl.fields.find((f) => f.code === "MA_TT")?.value.trim() || "USD";
  const vbpq = decl.fields.find((f) => f.code === "VBPQ")?.value ?? "";
  const info = submission?.customsInfo ?? null;
  const customs = customsValues(kind, info, submission?.result ?? null);
  const est: Estimate = {
    customsValueVnd: decl.customsValueVnd, currency, exchangeRate: decl.exchangeRate, lines: items.length,
    // Cộng tiền bằng số nguyên đồng (lib/decimal), không cộng số thực.
    ...(kind === "IDA" ? { taxVnd: fromMinor(sumMinor([toMinor(decl.estimatedImportDutyVnd, 0), toMinor(decl.estimatedVatVnd, 0)]), 0) } : {}),
  };
  const { values: customsFilled, estimated } = estimateValues(kind, customs, est);
  const estimate = estimateValues(kind, {}, est).values;
  const values: FormValues = { ...declarationValues(kind, decl.fields), ...customsFilled };
  const customsItems = customsItemValues(kind, info, lineNos);
  const itemRows = itemValues(kind, items, { fields: decl.fields, currency, vbpq }).map((v, i) => ({ ...v, ...customsItems[i] }));
  const errors = fieldErrors(kind, submission?.rejection ?? null);
  return { kind, lineNos, values, itemRows, errors, customs, estimate, estimated };
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
export function printAttention(data: PrintData, mode: DeclarationEditMode, canEdit: boolean): AttentionCell[] {
  const cells = attentionCells(data.kind, data.values, data.itemRows, data.errors, data.lineNos);
  return mode === "LOCKED" || !canEdit ? cells.filter((c) => c.reason !== "MISSING") : cells;
}

/** Lỗi Hải quan không gắn được vào ô nào (không có số chỉ tiêu, dòng hàng không có, chỉ tiêu không có trên bản in) – liệt kê riêng. */
export function unplacedErrors(kind: Kind, errors: FieldError[], lineNos: number[]): FieldError[] {
  const slots = slotsPerError(kind, slotOrder(kind, lineNos.length), errors, lineNos);
  return errors.filter((_, i) => slots[i]!.length === 0);
}

/** Việc cần xử lý của bản in: ô (lỗi → còn thiếu) + lỗi không gắn được vào ô. `count` = huy hiệu tab và số trên thanh công cụ. */
export type PrintIssues = { cells: AttentionCell[]; unplaced: FieldError[]; count: number };

export function printIssues(data: PrintData, mode: DeclarationEditMode, canEdit: boolean): PrintIssues {
  const cells = printAttention(data, mode, canEdit);
  const unplaced = unplacedErrors(data.kind, data.errors, data.lineNos);
  return { cells, unplaced, count: cells.length + unplaced.length };
}

/** Việc cần xử lý từ dữ liệu tờ khai (huy hiệu tab "Tờ khai" ở review-step – cùng hàm với thanh công cụ của bản in). */
export function printIssuesOf(decl: Declaration, items: LineItem[], submission: SubmissionView | undefined, mode: DeclarationEditMode, canEdit: boolean): PrintIssues {
  return printIssues(printData(decl, items, submission), mode, canEdit);
}

/** Số tờ khai chưa có (chưa đăng ký) – in thay cho ô trống (spec §3.1). */
export const NOT_ISSUED = "Chưa cấp";
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
  return name ? `${v}\u00a0 ${name}` : displayValue(field, v);
}

/**
 * Bản ngắn của ô mã (trang giấy hẹp và bản in, như mẫu VNACCS chỉ in mã): ô có tên theo bảng mã / lựa chọn / "mã · nghĩa"
 * (mã phân loại kiểm tra, trạng thái Hải quan) → chỉ mã; ô khác → null (in như printValue).
 */
export function printCode(field: Pick<LayoutField, "key" | "input" | "options" | "codeTable"> | undefined, raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || !field) return null;
  if (codeLabel(field.codeTable, v) || field.options?.some((o) => o.value === v)) return v;
  return displayValue(field, v).startsWith(`${v} · `) ? v : null;
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
