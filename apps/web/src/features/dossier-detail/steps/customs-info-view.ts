// Diễn giải thông tin Hải quan trả về cho người khai (thuần): ý nghĩa mã phân loại kiểm tra, chênh lệch so với số ứng dụng ước tính.
import { fromMinor, toMinor } from "@/lib/decimal";

/** Mã phân loại kiểm tra (TK_A06 / TK_K07): 1 xanh, 2 vàng, 3 đỏ. */
export function inspectionLabel(code: string | undefined): string | null {
  if (!code) return null;
  const meaning: Record<string, string> = {
    "1": "Luồng xanh – miễn kiểm tra hồ sơ và thực tế hàng",
    "2": "Luồng vàng – kiểm tra hồ sơ",
    "3": "Luồng đỏ – kiểm tra hồ sơ và thực tế hàng",
  };
  return meaning[code] ? `${code} · ${meaning[code]}` : code;
}

/** So số Hải quan tính với số ứng dụng ước tính (VND, số nguyên). Thiếu một trong hai → null. */
export function vndDiff(customsVnd: string | undefined, estimateVnd: string | undefined): { diff: string; same: boolean } | null {
  if (customsVnd === undefined || estimateVnd === undefined) return null;
  const d = toMinor(customsVnd, 0) - toMinor(estimateVnd, 0);
  return { diff: fromMinor(d, 0), same: d === 0 };
}
