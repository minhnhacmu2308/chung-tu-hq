// Tình trạng hợp đồng năm (gói CONTRACT, ADR 0011) – code thuần theo ngày giờ Việt Nam. Quy tắc nằm ở @kb/contracts (dùng chung với mock FE).
export { CONTRACT_GRACE_DAYS, CONTRACT_WARN_DAYS, contractCoversMonth, contractStatus, daysBetween, vnToday, type ContractState } from "@kb/contracts";

const VN_OFFSET = 7 * 3_600_000;

/** Tháng VN "YYYY-MM" chứa `now` và khoảng UTC [from, to) của tháng đó (số tờ khai đã tính trong tháng). */
export function vnMonthOf(now: Date): { month: string; from: Date; to: Date } {
  const month = new Date(now.getTime() + VN_OFFSET).toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { month, from: new Date(Date.UTC(y, m - 1, 1) - VN_OFFSET), to: new Date(Date.UTC(y, m, 1) - VN_OFFSET) };
}
