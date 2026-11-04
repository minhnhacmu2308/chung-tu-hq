// Ô nhập theo thứ tự (2.59 mã địa điểm xếp hàng lên xe 1 → 5, 2.60 số container 1 → 50): ô thứ n chỉ nhập khi ô n−1 đã có giá trị.
// MỘT quy tắc cho panel sửa ô (khóa ô chưa tới lượt), ô còn thiếu trên bản in, nút Phê duyệt / Ký số và backend (requiredGaps).
import { expandRepeat } from "./expand.js";
import { layoutFor } from "./layout-for.js";
import type { ConditionId } from "../declaration/conditions.js";
import type { LayoutField } from "./types.js";

type Kind = "IDA" | "EDA";
type Values = Record<string, string>;

/** Một dãy ô nhập theo thứ tự: số chỉ tiêu, tên chỉ tiêu, các ô theo thứ tự và điều kiện áp dụng (của nhóm / khối). */
export type FieldSequence = { no?: string; label: string; fields: LayoutField[]; condition?: ConditionId; blockCondition?: ConditionId };

const cache = new Map<Kind, FieldSequence[]>();

/** Các dãy ô nhập theo thứ tự của tờ khai (nhóm có `sequence`, nhóm lặp `sequential` – ô đầu mỗi dòng). */
export function fieldSequences(kind: Kind): FieldSequence[] {
  const hit = cache.get(kind);
  if (hit) return hit;
  const out: FieldSequence[] = [];
  for (const b of layoutFor(kind).declarant.flatMap((s) => s.blocks)) {
    for (const it of b.items) {
      const base = { label: it.label, ...(it.no ? { no: it.no } : {}), ...(it.kind !== "field" && it.condition ? { condition: it.condition } : {}), ...(b.condition ? { blockCondition: b.condition } : {}) };
      if (it.kind === "group" && it.sequence) out.push({ ...base, fields: it.sequence.flatMap((k) => it.fields.filter((f) => f.key === k)) });
      if (it.kind === "repeat" && it.sequential) out.push({ ...base, fields: expandRepeat(it).flatMap((row) => row.slice(0, 1)) });
    }
  }
  cache.set(kind, out);
  return out;
}

const has = (v: Values, key: string) => Boolean(v[key]?.trim());

/**
 * Ô chưa tới lượt nhập: thuộc dãy nhập theo thứ tự, đang trống và ô liền trước còn trống → trả ô liền trước và vị trí của nó (1-based).
 * Ô đã có giá trị luôn sửa / xóa được (không khóa dữ liệu đang có).
 */
export function sequenceBlocker(kind: Kind, key: string, v: Values): { field: LayoutField; position: number } | null {
  if (has(v, key)) return null;
  for (const s of fieldSequences(kind)) {
    const i = s.fields.findIndex((f) => f.key === key);
    if (i > 0 && !has(v, s.fields[i - 1]!.key)) return { field: s.fields[i - 1]!, position: i };
  }
  return null;
}

/** Ô trống nằm trước một ô đã nhập trong dãy (vd mã 1 trống mà có mã 2; container 3 trống mà có container 4) – thiếu, chặn duyệt / khai. */
export function sequenceHoles(kind: Kind, v: Values): { sequence: FieldSequence; field: LayoutField; index: number }[] {
  return fieldSequences(kind).flatMap((s) => {
    const last = s.fields.reduce((n, f, i) => (has(v, f.key) ? i : n), -1);
    return s.fields.slice(0, Math.max(last, 0)).flatMap((field, index) => (has(v, field.key) ? [] : [{ sequence: s, field, index }]));
  });
}
