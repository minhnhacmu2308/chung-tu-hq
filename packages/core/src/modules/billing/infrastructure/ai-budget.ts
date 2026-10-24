import { dec } from "../../../shared/decimal.js";
import type { Clock } from "../../../shared/clock.js";

/** Trần chi phí AI theo doanh nghiệp/ngày: `capVnd` "0" = không giới hạn. Thuần – nhận hàm đọc chi phí hôm nay. */
export function createAiBudget(opts: { capVnd: string; spentToday: (orgId: string, now: Date) => Promise<string>; clock: Clock }) {
  const cap = dec(opts.capVnd);
  return {
    async check(orgId: string) {
      if (cap.lte(0)) return { allowed: true, spentVnd: "0", capVnd: "0" };
      const spent = dec(await opts.spentToday(orgId, opts.clock.now()));
      return { allowed: spent.lt(cap), spentVnd: spent.toFixed(0), capVnd: cap.toFixed(0) };
    },
  };
}
