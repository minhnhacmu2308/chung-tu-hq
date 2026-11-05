// Phím tắt của panel sửa ô (hàm thuần – panel gắn vào sự kiện bàn phím).
//   Ctrl+S / Ctrl+Enter (⌘ trên Mac) → lưu từ bất kỳ đâu (ô nhiều dòng, ô ngày đang gõ dở…). F1 → bảng phím tắt.
//   Esc trên ô đã sửa → trả ô (và các ô do quy tắc tự đổi theo ô đó, vd PTVC → địa điểm xếp / dỡ, 1.31 / 2.30) về giá trị cũ; ô chưa sửa → Esc đóng panel như thường.
import type { FormValues } from "../declaration-form/form-state";

type Keys = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean };

export function panelShortcut(e: Keys): "SAVE" | "HELP" | null {
  if (e.isComposing) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && !e.shiftKey && (e.key === "Enter" || e.key.toLowerCase() === "s")) return "SAVE";
  if (e.key === "F1" && !mod && !e.altKey && !e.shiftKey) return "HELP";
  return null;
}

/**
 * Bỏ thay đổi của ô `key` cùng các ô mà quy tắc tự đổi theo nó (`derivedFrom`: ô bị đổi → ô gây ra). null = ô chưa sửa (giá trị như đang lưu).
 * Ô phụ thuộc người dùng đã tự sửa sau đó không còn trong `derivedFrom` (panel xóa khi sửa tay) → được giữ.
 */
export function revertField(changes: FormValues, base: FormValues, key: string, derivedFrom: ReadonlyMap<string, string>): FormValues | null {
  if (!(key in changes) || (changes[key] ?? "") === (base[key] ?? "")) return null;
  const next = { ...changes };
  delete next[key];
  for (const [k, from] of derivedFrom) if (from === key) delete next[k];
  return next;
}
