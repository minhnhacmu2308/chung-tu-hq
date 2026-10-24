// Ô bắt buộc còn trống trước khi khai Hải quan – MỘT quy tắc cho bản in bước Review (ô "còn thiếu"), nút Phê duyệt / Ký số & khai tạm,
// mock API và backend (approve, submit). Bắt buộc = vai trò REQUIRED (Phụ lục II + ô FPT bắt buộc – role.ts) hoặc "theo tình huống" có điều kiện đang áp dụng.
import { DECLARATION_CONDITIONS, type ConditionContext, type ConditionId } from "../declaration/conditions.js";
import { expandRepeat } from "./expand.js";
import { itemDefaults, itemOverrides } from "./item-fields.js";
import { declarationFormValues } from "./app-fields.js";
import { layoutFor } from "./layout-for.js";
import { fieldRole } from "./role.js";
import type { LayoutBlock, LayoutField, LayoutGroup, LayoutItem } from "./types.js";

type Kind = "IDA" | "EDA";
type Values = Record<string, string>;

const has = (v: Values, key: string) => Boolean(v[key]?.trim());

/** Dữ liệu xét điều kiện lấy từ chính giá trị trên form (đổi loại hình/phương thức vận chuyển, định danh, HAWB → ô ẩn/hiện ngay). */
export function conditionContext(kind: Kind, v: Values): ConditionContext {
  return {
    typeCode: (kind === "IDA" ? v["TK_ICB"] : v["TK_ECB"]) ?? "",
    transportCode: v["TK_MTC"] ?? "",
    incoterm: (v["TK_IP2"] ?? "").trim().toUpperCase(),
    hasInvoice: v["TK_IV1"] !== "B" && has(v, "TK_IV3"),
    identMode: v["APP_DD_PT"] ?? "",
    hawbIssued: v["APP_HAWB_CO"] === "CO",
    splitCargo: v["TVD_LOAIHANG"] ?? "",
    manualValue: v["APP_TGTT_TAY"] === "1",
    invoiceKind: v["TK_IV1"] ?? "",
  };
}

export const isApplicable = (x: { condition?: ConditionId | undefined }, ctx: ConditionContext) => !x.condition || DECLARATION_CONDITIONS[x.condition].test(ctx);

/**
 * Ô bắt buộc còn trống: vai trò "Bắt buộc", hoặc "Theo tình huống" mà ô (hay nhóm/khối chứa ô) có điều kiện ĐANG áp dụng.
 * Điều kiện không áp dụng (ô hiện mờ khi bật "hiện cả chỉ tiêu không áp dụng") → không báo thiếu.
 * Ô "theo tình huống" không gắn điều kiện cụ thể (ví dụ số hóa đơn) không bị coi là thiếu – tránh báo sai.
 */
export function missingRequired(kind: Kind, f: LayoutField, v: Values, parentNo: string | undefined, parentCondition: ConditionId | undefined, ctx: ConditionContext): boolean {
  if (f.origin === "CUSTOMS" || has(v, f.key)) return false;
  const condition = f.condition ?? parentCondition;
  if (condition && !DECLARATION_CONDITIONS[condition].test(ctx)) return false;
  const role = fieldRole(kind, f, parentNo);
  return role === "REQUIRED" || (role === "CONDITIONAL" && Boolean(condition));
}

/** Nhóm "chỉ cần một ô" (fill: any) còn thiếu: đang áp dụng, chưa ô nào có giá trị, và chỉ tiêu bắt buộc trong tình huống này. */
export function groupMissing(kind: Kind, g: LayoutGroup, v: Values, ctx: ConditionContext, blockCondition?: ConditionId): boolean {
  if (g.fields.some((f) => has(v, f.key))) return false;
  return g.fields.some((f) => missingRequired(kind, f, v, g.no, g.condition ?? blockCondition, ctx));
}

/** Một ô bắt buộc còn trống. `line`: chỉ số dòng hàng (0-based) – không có = ô của tờ khai. */
export type RequiredGap = { key: string; line?: number; no?: string; label: string };

/** Ô còn thiếu của một mục bố cục: nhóm lặp chỉ dòng 1; nhóm "chỉ cần một ô" báo ở ô đầu; mục/khối không áp dụng → không thiếu. */
function itemGaps(kind: Kind, item: LayoutItem, v: Values, ctx: ConditionContext, blockCondition: ConditionId | undefined): Omit<RequiredGap, "line">[] {
  if (blockCondition && !isApplicable({ condition: blockCondition }, ctx)) return [];
  if (!isApplicable(item, ctx)) return [];
  const gap = (f: LayoutField, no: string | undefined, label: string) => {
    const n = f.no ?? no;
    return n ? { key: f.key, label, no: n } : { key: f.key, label };
  };
  if (item.kind === "field") return missingRequired(kind, item, v, undefined, blockCondition, ctx) ? [gap(item, undefined, item.label)] : [];
  if (item.kind === "group" && item.fill === "any") return groupMissing(kind, item, v, ctx, blockCondition) && item.fields[0] ? [gap(item.fields[0], item.no, item.label)] : [];
  const fields = item.kind === "group" ? item.fields : (expandRepeat(item)[0] ?? []);
  const parentCondition = item.condition ?? blockCondition;
  return fields
    .filter((f) => isApplicable(f, ctx) && missingRequired(kind, f, v, item.no, parentCondition, ctx))
    .map((f) => gap(f, item.no, f.label ? `${item.label} – ${f.label}` : item.label));
}

/**
 * Khối "khai cả nhóm" (`fill: "all"` – hạn mức ngân hàng trả thuế thay, bảo lãnh): đã nhập một ô thì các ô còn trống của khối là thiếu.
 * Chưa nhập ô nào, hoặc khối không áp dụng → không thiếu. Chỉ xét ô đơn và ô con của nhóm (khối loại này không có nhóm lặp).
 */
export function allOrNoneGaps(b: LayoutBlock, v: Values, ctx: ConditionContext): Omit<RequiredGap, "line">[] {
  if (b.fill !== "all" || !isApplicable(b, ctx)) return [];
  const fields = b.items.flatMap((it) =>
    it.kind === "field" ? [{ f: it, no: it.no }] : it.kind === "group" && isApplicable(it, ctx) ? it.fields.map((f) => ({ f, no: f.no ?? it.no })) : [],
  ).filter(({ f }) => f.origin !== "CUSTOMS" && isApplicable(f, ctx));
  if (!fields.some(({ f }) => has(v, f.key))) return [];
  return fields.filter(({ f }) => !has(v, f.key)).map(({ f, no }) => {
    const label = `${f.label} (khai cả nhóm “${b.title}”)`;
    return no ? { key: f.key, label, no } : { key: f.key, label };
  });
}

const blockGaps = (kind: Kind, blocks: LayoutBlock[], v: Values) => {
  const ctx = conditionContext(kind, v);
  return blocks.flatMap((b) => {
    const gaps = b.items.flatMap((it) => itemGaps(kind, it, v, ctx, b.condition));
    return [...gaps, ...allOrNoneGaps(b, v, ctx).filter((g) => !gaps.some((x) => x.key === g.key))];
  });
};

/**
 * Mọi ô bắt buộc còn trống: tờ khai (`decl`) rồi từng dòng hàng (`items`, điều kiện xét theo giá trị của chính dòng).
 * Ô APP_* chỉ lưu trong phần mềm (nhóm loại hình suy từ mã loại hình, ngày vận đơn…) – không gửi Hải quan nên không chặn.
 */
export function requiredGaps(kind: Kind, decl: Values, items: Values[]): RequiredGap[] {
  const layout = layoutFor(kind);
  return [
    ...blockGaps(kind, layout.declarant.flatMap((s) => s.blocks), decl),
    ...items.flatMap((row, line) => blockGaps(kind, layout.item.declarant, row).map((g) => ({ ...g, line }))),
  ].filter((g) => !g.key.startsWith("APP_"));
}

/** "1.22 Địa chỉ – Dòng 1; Dòng hàng 2: 1.86 Đơn giá hóa đơn" – thông báo chặn duyệt/khai. `lineNos`: số dòng hàng hiển thị theo chỉ số. */
export function requiredGapsText(gaps: RequiredGap[], lineNos: number[] = []): string {
  return gaps.map((g) => `${g.line === undefined ? "" : `Dòng hàng ${lineNos[g.line] ?? g.line + 1}: `}${g.no ? `${g.no} ` : ""}${g.label}`).join("; ");
}

export type ItemFormInput = {
  id?: string | undefined; lineNo?: number | undefined; description: string; quantity: string; unit: string; unitPrice: string; amount: string; origin: string;
  hsSuggested?: string | null | undefined; hsConfirmed?: string | null | undefined; importDutyRate?: string | null | undefined; vatRate?: string | null | undefined; policyNote?: string | null | undefined;
};

/**
 * Dòng hàng → ô HAG_*: số liệu chứng từ (sửa ở OCR) + mã HS, thuế suất (luồng HS) + giá trị phần mềm tự điền khi truyền + ô người khai đã nhập trên tờ khai
 * (`fields`: chỉ tiêu HANG.<id dòng>.<ô>) – màn hình hiện đúng giá trị sẽ gửi FPT. `currency`, `vbpq` (EDA 2.80) cho giá trị tự điền.
 */
export function itemFormValues(kind: Kind, items: ItemFormInput[], ctx: { fields?: { code: string; value: string }[]; currency?: string; vbpq?: string } = {}): Values[] {
  const lineNos = items.map((it, i) => it.lineNo ?? i + 1);
  return items.map((it, i) => {
    const v: Values = {
      ...(ctx.currency ? itemDefaults(kind, { ...it, lineNo: lineNos[i]! }, { currency: ctx.currency, lineNos, ...(ctx.vbpq ? { vbpq: ctx.vbpq } : {}) }) : {}),
      HAG_CMD: it.hsConfirmed ?? it.hsSuggested ?? "", HAG_CMN: it.description, HAG_QN1: it.quantity, HAG_QT1: it.unit,
      HAG_UPR: it.unitPrice, HAG_BPR: it.amount,
    };
    // Mẫu 02 không có ô xuất xứ riêng (ghi trong mô tả "#&mã nước", app giữ ô Xuất xứ), ô thuế suất là thuế xuất khẩu – chỉ điền cho tờ khai nhập.
    if (kind === "IDA") {
      v["HAG_OR"] = it.origin;
      if (it.importDutyRate !== undefined && it.importDutyRate !== null) v["HAG_TXA"] = it.importDutyRate;
    } else if (it.origin) v["APP_XUAT_XU"] = it.origin;
    return it.id && ctx.fields ? { ...v, ...itemOverrides(ctx.fields, it.id) } : v;
  });
}

/**
 * Ô bắt buộc còn trống từ chỉ tiêu tờ khai (mã app + ô bổ sung + HANG.<id>.<ô>) và dòng hàng – backend (duyệt, khai) và mock dùng chung.
 * Mã tiền mặc định USD và VBPQ (EDA 2.80) cho giá trị dòng hàng tự điền, như bản in bước Review.
 */
export function declarationRequiredGaps(kind: Kind, fields: { code: string; value: string }[], items: ItemFormInput[]): RequiredGap[] {
  const value = (code: string) => fields.find((f) => f.code === code)?.value.trim() ?? "";
  const rows = itemFormValues(kind, items, { fields, currency: value("MA_TT") || "USD", vbpq: value("VBPQ") });
  return requiredGaps(kind, declarationFormValues(kind, fields), rows);
}
