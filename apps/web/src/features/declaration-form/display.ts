// Hiển thị giá trị trên bản mẫu tờ khai (thuần): tên theo bảng mã, ngày/số theo lib/format, mã trạng thái Hải quan kèm nghĩa, dòng của nhóm lặp.
import { CODE_TABLES, expandRepeat, FPT_CHANNELS, FPT_CLEARANCE, FPT_DECLARATION_STATES, type CodeTable, type LayoutField, type LayoutRepeat } from "@kb/contracts";
import { formatDate, formatNumber } from "@/lib/format";
import { inspectionLabel } from "../dossier-detail/steps/customs-info-view";
import type { FormValues } from "./form-state";

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

export function displayValue(f: Pick<LayoutField, "key" | "input">, value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (f.key === "TK_A06" || f.key === "TK_K07") return inspectionLabel(v) ?? v;
  const status = STATUS[f.key]?.(v);
  if (status) return `${v} · ${status}`;
  if (f.input === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v);
  if (f.input === "number" && /^-?\d+(\.\d+)?$/.test(v)) return formatNumber(v, v.split(".")[1]?.length ?? 0);
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
