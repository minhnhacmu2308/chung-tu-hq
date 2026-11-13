/**
 * Chia dòng bảng container của bản kê KVGS theo trang giấy A4 (spec KVGS §4: ~8 dòng/trang – mỗi dòng cao bằng một mã QR).
 * `firstPage`: số dòng của trang đầu (phần đầu trang – cơ quan, tiêu đề, mục 1–9 – chiếm chỗ). Không có dòng → một trang trống.
 */
export function paginateContainers<T>(rows: readonly T[], perPage = 8, firstPage = perPage): T[][] {
  const pages: T[][] = [rows.slice(0, Math.max(1, firstPage))];
  for (let i = Math.max(1, firstPage); i < rows.length; i += Math.max(1, perPage)) pages.push(rows.slice(i, i + Math.max(1, perPage)));
  return pages;
}

/**
 * Số dòng container tối đa mỗi trang giấy A4 của mẫu container – MỘT chỗ để chỉnh sau khi xem trước bản in trên trình duyệt.
 * Ước tính (in): dòng QR cỡ sm ~27,5 mm; đầu trang + mục 1–9 ~85 mm; tiêu đề bảng ~16 mm; "Ghi chú" + "Kết xuất" ~60 mm; vùng in ~281 mm.
 */
export const KVGS_PAGE_LIMITS = {
  /** Trang đầu, chưa phải trang cuối (có đầu trang, không có ghi chú). */
  first: 5,
  /** Trang giữa (chỉ bảng). */
  middle: 8,
  /** Trang đầu đồng thời là trang cuối (đầu trang + ghi chú). */
  firstWithNotes: 3,
  /** Trang cuối (không phải trang đầu) kèm ghi chú. */
  lastWithNotes: 6,
} as const;
export type KvgsPageLimits = { first: number; middle: number; firstWithNotes: number; lastWithNotes: number };

/** Một trang giấy: các dòng của trang + có in "Ghi chú"/"Kết xuất" không. Trang chỉ có ghi chú: `rows` rỗng. */
export type KvgsPage<T> = { rows: T[]; notes: boolean };

/**
 * Chia trang có chừa chỗ cho phần ghi chú ở trang cuối: dòng của trang cuối + ghi chú phải vừa một trang;
 * không vừa → ghi chú sang một trang riêng ở cuối (vẫn đếm trong "Trang x/y"). Luôn có ít nhất một trang.
 */
export function paginateWithNotes<T>(rows: readonly T[], limits: KvgsPageLimits = KVGS_PAGE_LIMITS): KvgsPage<T>[] {
  const chunks = paginateContainers(rows, limits.middle, limits.first);
  const pages: KvgsPage<T>[] = chunks.map((r) => ({ rows: r, notes: false }));
  const last = pages[pages.length - 1]!;
  const room = pages.length === 1 ? limits.firstWithNotes : limits.lastWithNotes;
  if (last.rows.length <= room) last.notes = true;
  else pages.push({ rows: [], notes: true });
  return pages;
}
