// Logic thuần của bản in tờ khai (Review bước 5): vị trí ô trên bố cục, số ước tính, trạng thái ô, danh sách ô cần xử lý, số trang.
import {
  expandRepeat, formKeysOf, layoutFor, otherFieldKeys, printKeys, printLayoutFor,
  type ConditionContext, type ConditionId, type LayoutBlock, type LayoutField,
} from "@kb/contracts";
import type { PaperFieldState } from "@kb/ui";
import { conditionContext, groupMissing, isApplicable, missingRequired, type FormValues } from "../declaration-form/form-state";
import type { FieldError } from "../dossier-detail/steps/customs-errors";

type Kind = "IDA" | "EDA";

/** Ô được chọn trên bản in: `line` = chỉ số dòng hàng (0-based) khi ô thuộc dòng hàng. */
export type PrintTarget = { key: string; line?: number };

/**
 * Vị trí một ô trên bố cục Phụ lục II. group = các ô cùng LayoutGroup / cùng dòng LayoutRepeat (hoặc [field]).
 * repeatRow: số dòng (1-based) khi ô thuộc nhóm lặp; fillAny: ô thuộc nhóm "chỉ cần một ô".
 */
export type FieldSpot = {
  field: LayoutField; group: LayoutField[]; parentNo?: string; parentCondition?: ConditionId; blockCondition?: ConditionId; scope: "decl" | "item";
  repeatRow?: number; fillAny?: boolean;
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
      expandRepeat(it).forEach((row, i) => { for (const f of row) put({ ...parent, field: f, group: row, repeatRow: i + 1 }); });
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
  for (const f of l.summary) out.set(f.key, { field: f, group: [f], scope: "decl" });
  locate(l.declarant.flatMap((s) => s.blocks), "decl", out);
  locate(l.customs.flatMap((s) => s.blocks), "decl", out);
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

/**
 * Chuỗi số → giá trị. Có cả chấm và phẩy → dấu sau cùng là thập phân; một loại dấu xuất hiện nhiều lần → phân cách nghìn;
 * xuất hiện một lần với đúng 3 chữ số theo sau → phân cách nghìn, ngược lại → thập phân.
 */
function parseNumber(s: string): number | null {
  let t = s.replace(/\s/g, "");
  if (!t) return null;
  const dot = t.lastIndexOf(".");
  const comma = t.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? "." : ",";
    t = t.replaceAll(dec === "." ? "," : ".", "").replace(dec, ".");
  } else if (dot >= 0 || comma >= 0) {
    const parts = t.split(dot >= 0 ? "." : ",");
    t = parts.length > 2 || parts[1]?.length === 3 ? parts.join("") : parts.join(".");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

/** Hai chuỗi cùng một số (bỏ qua cách viết phân cách nghìn / số 0 thập phân); chuỗi rỗng không bằng số nào. */
export function sameNumber(a: string, b: string): boolean {
  const x = parseNumber(a);
  const y = parseNumber(b);
  return x !== null && y !== null && x === y;
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

/** Ô người khai còn thiếu – cùng ngữ nghĩa form cũ: nhóm lặp chỉ xét dòng 1; nhóm "chỉ cần một ô" báo ở ô đầu; khối/nhóm không áp dụng → không thiếu. */
function isMissing(kind: Kind, spot: FieldSpot, v: FormValues, ctx: ConditionContext): boolean {
  if (spot.blockCondition && !isApplicable({ condition: spot.blockCondition }, ctx)) return false;
  if (spot.parentCondition && !isApplicable({ condition: spot.parentCondition }, ctx)) return false;
  if (spot.repeatRow !== undefined && spot.repeatRow > 1) return false;
  if (!isApplicable(spot.field, ctx)) return false;
  const parentCondition = spot.parentCondition ?? spot.blockCondition;
  if (spot.fillAny) {
    if (spot.group[0]?.key !== spot.field.key) return false;
    return groupMissing(kind, { kind: "group", label: "", fields: spot.group, fill: "any", ...(spot.parentNo ? { no: spot.parentNo } : {}) }, v, ctx, parentCondition);
  }
  return missingRequired(kind, spot.field, v, spot.parentNo, parentCondition, ctx);
}

type Slot = { key: string; line?: number };
const slotId = (c: Slot) => `${c.line ?? ""}:${c.key}`;

/**
 * Ô cần xử lý theo thứ tự nhảy: mọi ô lỗi rồi mới tới ô còn thiếu. Trong mỗi nhóm: printKeys (tờ khai, rồi từng dòng hàng),
 * sau đó "Chỉ tiêu khác" (tờ khai, rồi từng dòng). Lỗi gắn vào ô đầu tiên (theo thứ tự đó) của chỉ tiêu `no`;
 * `error.line` (số dòng hàng, 1-based) → chỉ số dòng = vị trí trong `lineNos`; không tìm thấy → bỏ qua.
 */
export function attentionCells(kind: Kind, decl: FormValues, items: FormValues[], errors: FieldError[], lineNos: number[]): AttentionCell[] {
  const loc = fieldLocator(kind);
  const printed = printKeys(printLayoutFor(kind));
  const other = otherFieldKeys(kind);
  const order: Slot[] = [];
  const seen = new Set<string>();
  const push = (s: Slot) => {
    const spot = loc.get(s.key);
    if (!spot || spot.scope !== (s.line === undefined ? "decl" : "item") || seen.has(slotId(s))) return;
    seen.add(slotId(s));
    order.push(s);
  };
  for (const keys of [printed, other]) {
    for (const key of keys.decl) push({ key });
    items.forEach((_, line) => { for (const key of keys.item) push({ key, line }); });
  }

  const errorIds = new Set<string>();
  for (const e of errors) {
    if (!e.no) continue;
    const line = e.line === undefined ? undefined : lineNos.indexOf(e.line);
    if (line === -1 || (line !== undefined && line >= items.length)) continue;
    const hit = order.find((s) => s.line === line && (loc.get(s.key)!.field.no ?? loc.get(s.key)!.parentNo) === e.no);
    if (hit) errorIds.add(slotId(hit));
  }

  const declCtx = conditionContext(kind, decl);
  const itemCtx = items.map((v) => conditionContext(kind, v));
  const cell = (s: Slot, reason: AttentionCell["reason"]): AttentionCell => ({ key: s.key, ...(s.line === undefined ? {} : { line: s.line }), reason });
  const out = order.filter((s) => errorIds.has(slotId(s))).map((s) => cell(s, "ERROR"));
  for (const s of order) {
    if (errorIds.has(slotId(s))) continue;
    const spot = loc.get(s.key)!;
    const missing = s.line === undefined ? isMissing(kind, spot, decl, declCtx) : isMissing(kind, spot, items[s.line]!, itemCtx[s.line]!);
    if (missing) out.push(cell(s, "MISSING"));
  }
  return out;
}
