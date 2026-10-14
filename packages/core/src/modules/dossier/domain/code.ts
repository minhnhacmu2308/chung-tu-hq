import type { Direction } from "@kb/contracts";

/** Mã hồ sơ HS-{NK|XK}-{YYMM}-{NNN}; NNN tăng theo số lớn nhất cùng chiều, cùng tháng trong org. */
export function nextDossierCode(direction: Direction, now: Date, existingCodes: string[]): string {
  const ym = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `HS-${direction}-${ym}-`;
  const max = existingCodes.filter((c) => c.startsWith(prefix)).reduce((m, c) => Math.max(m, Number(c.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
