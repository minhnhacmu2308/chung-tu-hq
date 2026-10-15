// Tuần được chọn khi nhập tay tỷ giá: tuần này + tuần sau (theo giờ VN) + các tuần đã có, mới nhất trước.
import { addIsoDays, isMonday, vnDateOf, weekStart } from "@kb/contracts";

export function editableWeeks(now: Date, existing: string[]): string[] {
  const thisWeek = weekStart(vnDateOf(now));
  return [...new Set([addIsoDays(thisWeek, 7), thisWeek, ...existing.filter(isMonday)])].sort().reverse();
}
