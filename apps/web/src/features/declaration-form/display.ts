// Hiển thị giá trị trên bản mẫu tờ khai (thuần): tên theo bảng mã, ngày/số theo lib/format, mã trạng thái Hải quan kèm nghĩa, dòng của nhóm lặp.
import { CODE_TABLES, DECLARATION_CONDITIONS, expandRepeat, FPT_CHANNELS, FPT_CLEARANCE, FPT_DECLARATION_STATES, type CodeTable, type ConditionContext, type LayoutField, type LayoutGroup, type LayoutRepeat } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { formatDate, formatNumber, getFormatLocale } from "@/lib/format";
import { FORM_MESSAGES } from "./form.messages";
import { inspectionLabel } from "../dossier-detail/steps/customs-info-view";
import { isApplicable, type FormValues } from "./form-state";

/** "1.44 · Tổng trị giá hóa đơn"; không có số chỉ tiêu → chỉ tên. */
export const fieldTitle = (no: string | undefined, label: string) => (no ? `${no} · ${label}` : label);

/** Tên của mã theo bảng mã có dữ liệu trong repo; bảng VNACCS chưa đồng bộ (A202, A519…) → undefined. */
export function codeLabel(table: CodeTable | undefined, value: string): string | undefined {
  if (!table || !value) return undefined;
  return CODE_TABLES[table]?.find((c) => c.code === value.trim())?.label;
}

/** Mã trạng thái Hải quan trả về → "mã · nghĩa". */
const STATUS: Record<string, (v: string) => string | undefined> = {
  TK_LUONG: (v) => (FPT_CHANNELS as Record<string, string>)[v],
  TK_THONGQUAN: (v) => (FPT_CLEARANCE as Record<string, string>)[v],
  TK_TRANGTHAI: (v) => (FPT_DECLARATION_STATES as Record<string, string>)[v],
};

/** `locale`: định dạng ngày/số (bản in pháp lý truyền "vi"); mặc định theo ngôn ngữ giao diện. */
export function displayValue(f: Pick<LayoutField, "key" | "input" | "options">, value: string, locale: UiLocale = getFormatLocale()): string {
  const v = value.trim();
  if (!v) return "";
  const option = f.options?.find((o) => o.value === v);
  if (option) return /^\d+$/.test(v) ? `${v} · ${option.label}` : option.label;
  if (f.key === "TK_A06" || f.key === "TK_K07") return inspectionLabel(v, locale) ?? v;
  const status = STATUS[f.key]?.(v);
  if (status) return `${v} · ${status}`;
  if (f.input === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v, locale);
  if (f.input === "number" && /^-?\d+(\.\d+)?$/.test(v)) return formatNumber(v, v.split(".")[1]?.length ?? 0, locale);
  return v;
}

/**
 * Dòng hiện của nhóm lặp. Người khai: dòng có dữ liệu + `extra` dòng thêm (luôn còn ít nhất 1 dòng trống để nhập), tới dòng cuối có dữ liệu.
 * Chỉ đọc (Hải quan trả về): chỉ dòng có dữ liệu.
 */
export function visibleRows(r: LayoutRepeat, values: FormValues, extra: number, readOnly: boolean): LayoutField[][] {
  const rows = expandRepeat(r);
  const filled = rows.map((row) => row.some((f) => Boolean(values[f.key]?.trim())));
  if (readOnly) return rows.filter((_, i) => filled[i]);
  const last = filled.lastIndexOf(true);
  return rows.slice(0, Math.min(r.count, last + 2 + extra));
}

/** Bề rộng ô theo `width` (ô con trong nhóm, ô trong bảng nhóm lặp) – xs 112px đủ một dòng cho nhãn ngắn ~15 ký tự (“Công thức chuẩn”). */
const WIDTH: Record<NonNullable<LayoutField["width"]>, string> = { xs: "w-28", sm: "w-40", md: "w-64", lg: "w-full", full: "w-full" };
/** Mọi ô ngày trên form cùng một bề rộng (đủ dd/mm/yyyy + nút lịch). */
export const DATE_WIDTH = "w-40";
export const fieldWidthClass = (f: Pick<LayoutField, "input" | "width">) => (f.input === "date" ? DATE_WIDTH : WIDTH[f.width ?? "sm"]);

/** Lý do nhóm / ô con đang hiện ("Có vì: …") – nằm trong hướng dẫn ⓘ của nhóm, không ghi dưới ô (ô con không có ⓘ riêng). */
export function groupGuideReason(g: LayoutGroup, ctx: ConditionContext, locale: UiLocale): string | undefined {
  const t = pickMessages(FORM_MESSAGES, locale);
  const own = g.condition && isApplicable(g, ctx) ? fill(t.presentBecause, { c: DECLARATION_CONDITIONS[g.condition].label }) : null;
  const subs = g.fields.filter((f) => f.condition && isApplicable(f, ctx)).map((f) => `${f.label} – ${fill(t.presentBecause, { c: DECLARATION_CONDITIONS[f.condition!].label })}`);
  return [own, ...subs].filter(Boolean).join(" · ") || undefined;
}
