// Chia dòng hàng thành các tờ khai nhánh: mỗi tờ tối đa 50 dòng (IDA/EDA), tờ k = dòng (k-1)·50+1 … k·50 theo thứ tự lineNo.
export const BRANCH_MAX_LINES = 50;

export type BranchRange = {
  /** Số thứ tự nhánh, từ 1 (TK_BNO). */
  no: number;
  /** Tổng số nhánh (TK_DNO). */
  of: number;
  /** lineNo thật của dòng đầu/cuối trong nhánh; 0 khi lô không có dòng. */
  lineFrom: number;
  lineTo: number;
  /** [start, end) trong mảng dòng đã sắp tăng dần theo lineNo. */
  index: [number, number];
};

/** Số nhánh của lô: max(1, ceil(n/50)). */
export function branchCount(lineCount: number): number {
  return Math.max(1, Math.ceil(lineCount / BRANCH_MAX_LINES));
}

export function branchRanges(lineNos: number[]): BranchRange[] {
  const sorted = [...lineNos].sort((a, b) => a - b);
  const of = branchCount(sorted.length);
  return Array.from({ length: of }, (_, k) => {
    const start = k * BRANCH_MAX_LINES;
    const end = Math.min(sorted.length, start + BRANCH_MAX_LINES);
    return {
      no: k + 1,
      of,
      lineFrom: sorted[start] ?? 0,
      lineTo: sorted[end - 1] ?? 0,
      index: [start, end] as [number, number],
    };
  });
}
